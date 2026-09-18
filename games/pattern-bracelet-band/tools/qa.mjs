#!/usr/bin/env node
// Production Chrome smoke/interaction/visual-QC driver for Pattern Bracelet Band.
import path from 'node:path';
import { args, baseUrl, checkSessionClean, createReporter, debug, dragBetween, ensureShots, launchChrome, openSession, resolveShots } from '../../../tools/qa/lib/driver.mjs';

if (args.has('help')) {
  console.log('Usage: node games/pattern-bracelet-band/tools/qa.mjs --base <url> --shots <dir>');
  process.exit(0);
}
const base = baseUrl();
const shots = resolveShots(args.flag('shots', '/private/tmp/pattern-bracelet-band-qa'));
const { check, finish } = createReporter({ detailOnFail: true });
const sessions = [];
const url = `${base}/games/pattern-bracelet-band/`;

async function run(browser, options = {}) {
  const session = await openSession(browser, { url, base, goto: false, ready: false, allowDataUrls: true, allowAbortedMedia: true, allowRemote: ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'], viewport: options.viewport || { width: 1180, height: 820 }, reducedMotion: options.reducedMotion || 'no-preference' });
  await session.context.route(/https:\/\/(?:www\.googletagmanager\.com|www\.google-analytics\.com)\//, (route) => route.fulfill({ status: 204, body: '' }));
  if (options.legacyJams) {
    await session.page.addInitScript((sequence) => {
      localStorage.clear();
      localStorage.setItem('qlo.be/pattern-bracelet-band/jams', JSON.stringify(sequence));
    }, options.legacyJams);
  }
  await session.page.goto(url, { waitUntil: 'networkidle' });
  await debug.waitForHook(session.page); await debug.waitForReady(session.page);
  await debug.seed(session.page, 42); await debug.fastTimers(session.page, 0.05); await debug.mute(session.page, true);
  sessions.push(session); return session;
}
const state = (p) => debug.getState(p);
async function shot(p, name) { await p.screenshot({ path: path.join(shots, name), fullPage: false }); }
async function layout(p, label) {
  const result = await p.evaluate(() => {
    const targets = window.QLOBE_DEBUG.getTargets?.() || [];
    return { small: targets.filter((t) => t.rect && (t.rect.w < 96 || t.rect.h < 96)), out: targets.filter((t) => t.rect && (t.rect.x < -1 || t.rect.y < -1 || t.rect.x + t.rect.w > innerWidth + 1 || t.rect.y + t.rect.h > innerHeight + 1)), overflow: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight };
  });
  check(`${label}: hit targets >=96px`, result.small.length === 0, JSON.stringify(result.small));
  check(`${label}: targets in viewport`, result.out.length === 0, JSON.stringify(result.out));
  check(`${label}: no overflow`, !result.overflow, JSON.stringify(result));
}
async function waitState(p, predicate, label) { await p.waitForFunction(predicate, null, { timeout: 10000 }).catch((e) => { throw new Error(`${label}: ${e.message}`); }); }

async function drive(browser) {
  const run1 = await run(browser); const { page } = run1;
  check('debug ready', await page.evaluate(() => Boolean(window.QLOBE_DEBUG?.ready)));
  check('production has no SVG/canvas artwork', await page.locator('svg,canvas').count() === 0);
  const legacy = ['red', 'yellow', 'blue', 'purple', 'teal', 'coral', null, 'red'];
  const migration = await run(browser, { legacyJams: legacy });
  await debug.startMode(migration.page, 'jam');
  const migrated = await state(migration.page);
  check('legacy Free Jam migrates board sequence and jewelry slot 0', JSON.stringify(migrated.boardSlots) === JSON.stringify(legacy) && JSON.stringify(migrated.saves?.[0]) === JSON.stringify(legacy), JSON.stringify({ boardSlots: migrated.boardSlots, save0: migrated.saves?.[0] }));
  await migration.page.evaluate(() => localStorage.clear());
  await layout(page, 'landscape'); await shot(page, '01-splash-landscape.png');
  for (const mode of ['pop', 'star', 'jam']) {
    await debug.startMode(page, mode); check(`${mode} mode opens`, (await state(page)).mode === mode);
    await shot(page, `02-${mode}.png`);
  }
  await debug.startMode(page, 'pop');
  const initial = await state(page); const beads = await page.locator('[data-bead]').count();
  check('guided has bead choices', beads >= 2, String(beads));
  const expected = initial.expected; const wrong = page.locator(`[data-bead]:not([data-bead="${expected}"])`).first();
  await wrong.click(); await page.waitForTimeout(80);
  const afterWrong = await state(page); check('wrong bead does not advance', afterWrong.placed.length === initial.placed.length && afterWrong.expected === expected, JSON.stringify(afterWrong));
  await debug.call(page, 'place', expected, initial.targetSlot); await page.waitForTimeout(100);
  check('correct expected placement progresses', (await state(page)).placed.length > initial.placed.length, JSON.stringify(await state(page)));
  await debug.startMode(page, 'jam');
  const jamStart = await state(page); const source = page.locator('[data-bead]').first(); const slot = page.locator('#slots [data-slot]').first();
  await dragBetween(page, await source.boundingBox(), await slot.boundingBox());
  check('real pointer drag places a jam bead', (await state(page)).placed.length > 0, JSON.stringify(await state(page)));
  await debug.call(page, 'setTempo', 72); check('tempo lower bound clamps', (await state(page)).bpm === 72);
  await debug.call(page, 'setTempo', 168); check('tempo upper bound clamps', (await state(page)).bpm === 168);
  await debug.call(page, 'setTempo', 108); await debug.call(page, 'playOnce'); check('playback stays in workshop', (await state(page)).screen === 'play');
  await debug.call(page, 'saveJam', 0); await debug.call(page, 'loadJam', 0); check('jam save/load roundtrip', (await state(page)).placed.length > 0 && (await state(page)).saves?.[0]);
  await shot(page, '03-jam-playback.png');
  for (const size of [{ width: 820, height: 1180 }, { width: 1180, height: 520 }]) {
    const tag = `${size.width}x${size.height}`;
    const s = await run(browser, { viewport: size, reducedMotion: 'reduce' });
    await layout(s.page, tag); await shot(s.page, `04-${tag}-splash.png`);
    await debug.startMode(s.page, 'pop'); await debug.call(s.page, 'winRound'); await s.page.waitForTimeout(100);
    await layout(s.page, `${tag} Pop play`); await shot(s.page, `05-${tag}-pop-play.png`);
    await debug.startMode(s.page, 'jam');
    for (const [index, bead] of ['red', 'yellow', 'blue'].entries()) await debug.call(s.page, 'place', bead, index);
    await s.page.waitForTimeout(100); await layout(s.page, `${tag} Jam populated`); await shot(s.page, `06-${tag}-jam-populated.png`);
    await debug.startMode(s.page, 'pop');
    for (let index = 0; index < 3; index += 1) { await debug.call(s.page, 'winRound'); await s.page.waitForTimeout(100); }
    check(`${tag} reaches concert`, (await state(s.page)).screen === 'concert'); await layout(s.page, `${tag} Concert`); await shot(s.page, `07-${tag}-concert.png`);
  }
  await page.reload({ waitUntil: 'networkidle' }); await debug.waitForHook(page); await debug.waitForReady(page); check('persistence survives reload', (await state(page)).saves?.[0]);
  await debug.mute(page, false); await page.locator('[data-target="mode-pop"]').click();
  const audio = await debug.call(page, 'getAudioLog'); check('recorded voice clip logged', audio.some((x) => x.kind === 'clip'), JSON.stringify(audio)); await debug.mute(page, true);
  await debug.startMode(page, 'pop');
  for (let i = 0; i < 3; i += 1) { await debug.call(page, 'winRound'); await page.waitForTimeout(120); }
  check('three guided wins reach concert', (await state(page)).screen === 'concert', JSON.stringify(await state(page))); await shot(page, '05-concert.png');
  await debug.tap(page, 'replay').catch(() => {}); check('concert replay remains playable', ['workshop', 'concert'].includes((await state(page)).screen));
  await debug.call(page, 'clearJam', 0); await debug.tap(page, 'back').catch(() => {}); await debug.tap(page, 'home').catch(() => {});
  for (const [i, s] of sessions.entries()) checkSessionClean({ check }, s, `session ${i + 1}`);
}
async function closeFast(task) { await Promise.race([Promise.resolve().then(task).catch(() => {}), new Promise((resolve) => setTimeout(resolve, 3000))]); }
async function main() { await ensureShots(shots); const browser = await launchChrome(); try { await drive(browser); } finally { await Promise.all(sessions.map((s) => closeFast(() => s.close()))); await closeFast(() => browser.close()); } finish({ suffix: `; screenshots in ${shots}`, exit: true }); }
main().catch((e) => { console.error(e); process.exitCode = 1; });
