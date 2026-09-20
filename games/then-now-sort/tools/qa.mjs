#!/usr/bin/env node
// Then & Now — production smoke, interaction, audio and responsive visual QC.
import {
  args, audio, baseUrl, checkSessionClean, createReporter, debug, dragBetween,
  ensureShots, launchChrome, openSession, resolveShots, shooter, targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const gameUrl = `${base}/games/then-now-sort/`;
const shots = resolveShots('qa-shots/then-now-sort');
const shot = shooter(shots);
const reporter = createReporter({ detailOnFail: true, collapse: true, detailLimit: 1400 });
const { check, note, finish } = reporter;
const sessions = [];
const viewports = [
  { width: 1180, height: 820, name: 'landscape' },
  { width: 1024, height: 768, name: 'ipad' },
  { width: 768, height: 1024, name: 'portrait' },
  { width: 1180, height: 520, name: 'short-landscape' },
];
const analyticsOrigins = [
  'https://www.googletagmanager.com/',
  'https://www.google-analytics.com/',
];
const nowByPair = {
  light: 'lightbulb', write: 'keyboard', travel: 'car',
  message: 'smartphone', music: 'headphones', wash: 'washing-machine',
};

function cleanSession(session, label) {
  session.failed = session.failed.filter((entry) => !analyticsOrigins.some((origin) => String(entry).startsWith(origin)));
  checkSessionClean(reporter, session, label);
}

async function boot(browser, viewport, reducedMotion = 'no-preference', muted = true) {
  const session = await openSession(browser, {
    url: gameUrl, base, viewport, reducedMotion, muted, ready: true,
    allowAbortedMedia: true, allowRemote: analyticsOrigins,
  });
  await debug.fastTimers(session.page, 0.05);
  await debug.seed(session.page, 42);
  await debug.mute(session.page, muted);
  sessions.push(session);
  return session;
}

async function audit(page, label, minimum = 96) {
  const layout = await page.evaluate(() => ({
    horizontal: document.documentElement.scrollWidth - innerWidth,
    vertical: document.documentElement.scrollHeight - innerHeight,
    broken: [...document.images].filter((image) => image.complete && image.naturalWidth === 0).map((image) => image.src),
  }));
  check(`${label}: no overflow`, layout.horizontal <= 1 && layout.vertical <= 1, JSON.stringify(layout));
  check(`${label}: all raster art decodes`, layout.broken.length === 0, layout.broken.join(', '));
  const small = undersized(await targetSizes(page), minimum);
  check(`${label}: visible child targets are at least ${minimum}px`, small.length === 0,
    small.map((item) => `${item.id}:${Math.round(item.w)}x${Math.round(item.h)}`).join(', '));
}

async function hubPass(browser) {
  const page = await browser.newPage({ viewport: viewports[0] });
  try {
    const response = await page.goto(`${base}/#culture-geography`, { waitUntil: 'networkidle' });
    check('hub route loads successfully', response?.ok(), `HTTP ${response?.status()}`);
    const card = page.locator('[data-game-id="then-now-sort"]');
    await card.waitFor({ state: 'visible' });
    check('hub registers Then & Now once', await card.count() === 1);
    check('hub tile decodes', await card.locator('img').evaluate((image) => image.complete && image.naturalWidth > 0));
    await shot(page, '00-hub-catalog');
    await Promise.all([page.waitForURL('**/games/then-now-sort/'), card.click()]);
    await page.waitForFunction(() => window.QLOBE_DEBUG?.version === 1);
    check('hub card navigates to playable route', page.url().endsWith('/games/then-now-sort/'));
  } finally { await page.close(); }
}

async function sortPass(page) {
  await debug.call(page, 'clearProgress');
  check('direct route starts on splash', (await debug.getState(page)).screen === 'splash');
  check('both adventures are listed', (await debug.listModes(page)).map((mode) => mode.id).join(',') === 'sort,match');
  await shot(page, '01-splash-landscape');
  await debug.fastTimers(page, 1);
  await page.locator('[data-target="mode-sort"]').click();
  await debug.waitForScreen(page, 'sort');
  await shot(page, '02-sort-empty');
  await audit(page, 'sort screen');
  const first = (await debug.getState(page)).sortQueue[0];
  const wrongEra = first.era === 'then' ? 'now' : 'then';
  await page.locator(`[data-target="sort-item-${first.id}"]`).click();
  await page.locator(`[data-target="era-${wrongEra}"]`).click();
  await page.waitForTimeout(120);
  check('wrong sort choice is rejected', (await debug.getState(page)).lastResult === 'wrong');
  await shot(page, '03-sort-wrong');
  await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().busy);
  await page.locator(`[data-target="sort-item-${first.id}"]`).click();
  await page.locator(`[data-target="era-${first.era}"]`).click();
  await debug.waitForState(page, 'round', 1);
  check('physical tap-tap sort placement advances one round', (await debug.getState(page)).sorted.length === 1);
  const state = await debug.getState(page);
  const next = state.sortQueue[state.round];
  const card = await page.locator(`[data-target="sort-item-${next.id}"]`).boundingBox();
  const pocket = await page.locator(`[data-target="era-${next.era}"]`).boundingBox();
  if (card && pocket) await dragBetween(page, card, pocket, { steps: 14 });
  await debug.waitForState(page, 'round', 2);
  check('physical pointer drag places next card', (await debug.getState(page)).sorted.length === 2);
  await debug.waitForScreen(page, 'reveal');
  await page.waitForTimeout(760);
  await shot(page, '04-sort-reveal');
  check('sort reveal has a paired result', Boolean((await debug.getState(page)).activePairId));
  await debug.fastTimers(page, 0.05);
  for (let guard = 0; guard < 12 && (await debug.getState(page)).screen !== 'gallery'; guard += 1) {
    await debug.winRound(page);
  }
  await debug.waitForScreen(page, 'gallery');
  await shot(page, '05-sort-gallery');
  check('sort completion opens gallery', (await debug.getState(page)).galleryPairIds.length === 3);
}

async function matchPass(page) {
  await debug.call(page, 'home');
  await debug.waitForScreen(page, 'splash');
  await page.locator('[data-target="mode-match"]').click();
  await debug.waitForScreen(page, 'match');
  await shot(page, '06-match-first');
  for (let round = 0; round < 3; round += 1) {
    const state = await debug.getState(page);
    const pair = state.activePairId;
    const before = state.matches.length;
    const correct = nowByPair[pair];
    const wrong = state.candidates.find((id) => id !== correct);
    if (round === 0) await debug.fastTimers(page, 1);
    await page.locator(`[data-target="candidate-${wrong}"]`).click();
    if (round === 0) {
      await page.waitForTimeout(120);
      await shot(page, '07-match-wrong');
    }
    check(`match wrong choice rejected (${round + 1})`, (await debug.getState(page)).lastResult === 'wrong');
    await page.waitForFunction(() => !window.QLOBE_DEBUG.getState().busy);
    if (round === 0) await debug.fastTimers(page, 0.05);
    await page.locator(`[data-target="candidate-${correct}"]`).click();
    await debug.waitForScreen(page, 'reveal');
    check(`match pair ${round + 1} reveals`, (await debug.getState(page)).matches.length === before + 1);
    if (round === 2) {
      await page.waitForTimeout(760);
      await shot(page, '08-match-reveal-three');
    }
    await debug.winRound(page);
    if (round < 2) await debug.waitForScreen(page, 'match');
  }
  await debug.waitForScreen(page, 'gallery');
  check('three match reveals complete gallery', (await debug.getState(page)).galleryPairIds.length === 3);
  await shot(page, '09-match-gallery');
}

async function audioAndPersistence(page) {
  const log = await debug.getAudioLog(page);
  check('recorded teacher clips are requested after real gestures', audio.clips(log).length > 0, audio.describe(log));
  check('voice prompt order includes mode guidance', audio.heard(log, 'match-intro') || audio.heard(log, 'sort-intro'), audio.describe(log));
  const voiceAudit = await page.evaluate(async () => {
    const [config, manifest] = await Promise.all([
      fetch('./config.json').then((response) => response.json()),
      fetch('./assets/audio/manifest.json').then((response) => response.json()),
    ]);
    const required = [
      ...Object.keys(config.voice),
      ...config.pairs.flatMap((pair) => [`object-${pair.then.id}`, `object-${pair.now.id}`, `pair-${pair.id}`]),
    ];
    const missing = required.filter((key) => !manifest[key]);
    const context = new AudioContext();
    const broken = [];
    for (const [key, entry] of Object.entries(manifest)) {
      try {
        const response = await fetch(`./assets/audio/${entry.file}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (!(buffer.duration > .2)) throw new Error('empty duration');
      } catch (error) { broken.push(`${key}:${error.message}`); }
    }
    await context.close();
    return { count: Object.keys(manifest).length, missing, broken };
  });
  check('recorded manifest covers every configured line', voiceAudit.missing.length === 0, JSON.stringify(voiceAudit));
  check('every recorded teacher clip decodes in Chrome', voiceAudit.broken.length === 0, JSON.stringify(voiceAudit));
  await page.reload({ waitUntil: 'networkidle' });
  await debug.waitForHook(page); await debug.waitForReady(page);
  check('gallery progress persists after reload', (await debug.getState(page)).discoveredPairIds.length >= 3);
  await debug.mute(page, true);
  await page.locator('[data-target="gallery"]').click();
  await debug.waitForScreen(page, 'gallery');
  check('earned gallery reopens from the splash badge', (await debug.getState(page)).galleryPairIds.length === 3);
}

async function responsivePass(browser, viewport, reduced = 'no-preference') {
  const session = await boot(browser, viewport, reduced, true);
  const { page } = session;
  const suffix = reduced === 'reduce' ? `${viewport.name}-reduced` : viewport.name;
  await shot(page, `08-${suffix}-splash`);
  await audit(page, `${suffix} splash`);
  await debug.startMode(page, 'sort'); await debug.waitForScreen(page, 'sort');
  await shot(page, `11-${suffix}-sort`); await audit(page, `${suffix} sort`);
  await debug.startMode(page, 'match'); await debug.waitForScreen(page, 'match');
  await shot(page, `12-${suffix}-match`); await audit(page, `${suffix} match`);
  check(`${suffix}: reduced motion state matches context`, (await debug.getState(page)).reducedMotion === (reduced === 'reduce'));
  cleanSession(session, `${suffix} session`);
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({ headless: !args.has('headed') });
  try {
    await hubPass(browser);
    const primary = await boot(browser, viewports[0], 'no-preference', false);
    await sortPass(primary.page); await matchPass(primary.page); await audioAndPersistence(primary.page);
    cleanSession(primary, 'primary session');
    for (const viewport of viewports.slice(1)) await responsivePass(browser, viewport);
    await responsivePass(browser, viewports[0], 'reduce');
    note(`screenshots written to ${shots}`);
  } finally {
    for (const session of sessions) await session.close().catch(() => {});
    await browser.close();
  }
  finish({ suffix: `; shots in ${shots}` });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
