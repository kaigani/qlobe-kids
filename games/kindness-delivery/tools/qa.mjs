#!/usr/bin/env node
import path from 'node:path';
import { args, launchChrome, createReporter, openSession, checkSessionClean, resolveShots, ensureShots, dragBetween } from '../../../tools/qa/lib/driver.mjs';

const base = (args.flag('base', 'http://127.0.0.1:8000') || '').replace(/\/$/, '');
const url = `${base}/games/kindness-delivery/`;
const shots = resolveShots('qa-shots/kindness-delivery');
const { check, finish } = createReporter();
await ensureShots(shots);
let browser;
const sessions = [];
async function session(viewport, opts = {}) {
  const s = await openSession(browser, { url, base, viewport, ...opts, after: async (page) => {
    await page.evaluate(() => { window.QLOBE_DEBUG.mute(true); window.QLOBE_DEBUG.fastTimers(true); window.QLOBE_DEBUG.seed(42); });
    if (opts.after) await opts.after(page);
  }}); sessions.push(s); return s;
}
async function draw(page) {
  const b = await page.locator('#note-canvas').boundingBox();
  await page.mouse.move(b.x + b.width*.2, b.y + b.height*.55); await page.mouse.down();
  await page.mouse.move(b.x + b.width*.45, b.y + b.height*.3, {steps:8});
  await page.mouse.move(b.x + b.width*.78, b.y + b.height*.62, {steps:8}); await page.mouse.up();
}
try {
  browser = await launchChrome();
  const s = await session({width:1180,height:820}); const p = s.page;
  check('select screen boots', await p.locator('#screen-select').isVisible());
  check('three debug modes', (await p.evaluate(() => window.QLOBE_DEBUG.listModes())).length === 3);
  const targets = await p.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('child targets are 96px', targets.filter(t => t.rect.w && (!t.id.startsWith('sound-'))).every(t => t.rect.w >= 96 && t.rect.h >= 96));
  check('landscape has no overflow', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight));
  await p.screenshot({path:path.join(shots,'01-select.png')});

  await p.locator('[data-target="friend-fox"]').click(); await p.waitForTimeout(250);
  const noteTargets = await p.evaluate(() => window.QLOBE_DEBUG.getTargets());
  check('studio opens', await p.locator('#screen-studio').isVisible());
  check('studio controls 96px', noteTargets.filter(t => t.rect.w).every(t => t.rect.w >= 96 && t.rect.h >= 96));
  await draw(p); check('real pointer drawing records stroke', (await p.evaluate(() => window.QLOBE_DEBUG.getState().strokeCount)) > 0);
  await p.evaluate(() => window.QLOBE_DEBUG.tap('tool-stamp')); await p.evaluate(() => window.QLOBE_DEBUG.tap('stamp-sun'));
  check('actual stamp adds content', (await p.evaluate(() => window.QLOBE_DEBUG.getState().stickerCount)) === 0 || (await p.evaluate(() => window.QLOBE_DEBUG.getState().hasContent)));
  await p.evaluate(() => window.QLOBE_DEBUG.tap('tool-sticker')); await p.evaluate(() => window.QLOBE_DEBUG.tap('sticker-rainbow'));
  await p.evaluate(() => window.QLOBE_DEBUG.tap('undo'));
  await p.evaluate(() => window.QLOBE_DEBUG.tap('clear')); check('clear removes note content', !(await p.evaluate(() => window.QLOBE_DEBUG.getState().hasContent)));
  await p.evaluate(() => window.QLOBE_DEBUG.tap('restore')); check('restore returns note', await p.evaluate(() => window.QLOBE_DEBUG.getState().hasContent));
  await p.evaluate(() => window.QLOBE_DEBUG.tap('ready-note')); await p.waitForTimeout(900);
  check('ready reaches flight', await p.locator('#screen-flight').isVisible()); await p.screenshot({path:path.join(shots,'02-flight.png')});
  const plane = await p.locator('#plane-actor').boundingBox(); await p.mouse.move(plane.x+20,plane.y+20); await p.mouse.down(); await p.mouse.move(plane.x+35,plane.y+25); await p.mouse.up();
  check('short invalid swipe stays flight', await p.locator('#screen-flight').isVisible());
  const b2 = await p.locator('#plane-actor').boundingBox(); await p.mouse.move(b2.x+20,b2.y+20); await p.mouse.down(); await p.mouse.move(b2.x+b2.width+180,b2.y,{steps:12}); await p.mouse.up(); await p.waitForTimeout(500);
  check('valid swipe delivers', await p.locator('#screen-delivery').isVisible()); await p.screenshot({path:path.join(shots,'03-delivery.png')});
  await p.locator('#send-another').click(); check('send another returns select', await p.locator('#screen-select').isVisible());
  checkSessionClean({check}, s, 'core session'); await s.close();

  for (const mode of ['fox','bunny','bear']) { const d = await session({width:820,height:1180}, {reducedMotion:'reduce'}); await d.page.evaluate(m => window.QLOBE_DEBUG.startMode(m), mode); await d.page.waitForTimeout(120); check(`debug mode ${mode}`, (await d.page.evaluate(() => window.QLOBE_DEBUG.getState().friendId)) === mode); await d.close(); }
  const touch = await session({width:1024,height:768}, {deviceScaleFactor:2}); check('touch viewport no overflow', await touch.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)); await touch.close();
  const short = await session({width:1180,height:520}); check('short landscape no overflow', await short.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight)); await short.close();
} finally { for (const s of sessions) { try { await s.close(); } catch {} } if (browser) await browser.close(); }
finish();
