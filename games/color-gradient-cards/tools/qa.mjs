#!/usr/bin/env node
// Real-Chrome acceptance driver for Color Gradient Cards.
import path from 'node:path';
import { baseUrl, launchChrome, createReporter, openSession, checkSessionClean, resolveShots, ensureShots } from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const shots = resolveShots('qa-shots/color-gradient-cards');
const { check, finish } = createReporter();
const sessions = [];
const PLATFORM_ANALYTICS = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
async function game(browser, viewport, reducedMotion = 'no-preference') {
  const session = await openSession(browser, { url: `${base}/games/color-gradient-cards/`, base, viewport, reducedMotion, seed: 42, fastTimers: true, allowAbortedMedia: true, allowRemote: PLATFORM_ANALYTICS });
  sessions.push(session); return session.page;
}
const state = (p) => p.evaluate(() => window.QLOBE_DEBUG.getState());
const wait = (p, fn) => p.waitForFunction(fn);
async function shot(page, name) {
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => [...document.images].filter(i => i.offsetParent && i.src).every(i => i.complete && i.naturalWidth));
  await page.evaluate(async () => Promise.all([...document.images].filter(i => i.offsetParent && i.src).map(i => i.decode?.())));
  await page.screenshot({ path: path.join(shots, name) });
}
async function auditViewport(page, viewport, label) {
  const targets = await page.evaluate(() => QLOBE_DEBUG.getTargets());
  const outside = targets.filter(({ rect }) => rect.x < 0 || rect.y < 0 || rect.x + rect.w > viewport.width + 1 || rect.y + rect.h > viewport.height + 1);
  check(`viewport contained ${viewport.width}x${viewport.height} ${label}`, outside.length === 0, outside.length ? JSON.stringify(outside) : '');
  const hitAreasPass = await page.evaluate(() => [...document.querySelectorAll('[data-target],button')]
    .filter((element) => element.offsetParent)
    .every((element) => {
      const rect = element.getBoundingClientRect();
      const pseudo = getComputedStyle(element, '::before');
      const pseudoWidth = parseFloat(pseudo.width) || 0;
      const pseudoHeight = parseFloat(pseudo.height) || 0;
      return Math.max(rect.width, pseudoWidth) >= 96 && Math.max(rect.height, pseudoHeight) >= 96;
    }));
  check(`96px hit area ${viewport.width}x${viewport.height} ${label}`, hitAreasPass);
  const clippedText = await page.evaluate(() => [...document.querySelectorAll('.paper-play-button span, .end-tableau h1, .end-tableau p, .paper-prompt')]
    .filter((element) => element.offsetParent)
    .map((element) => ({ text: element.textContent.trim(), rect: element.getBoundingClientRect().toJSON() }))
    .filter(({ rect }) => rect.x < -1 || rect.y < -1 || rect.right > innerWidth + 1 || rect.bottom > innerHeight + 1));
  check(`visible text contained ${viewport.width}x${viewport.height} ${label}`, clippedText.length === 0, clippedText.length ? JSON.stringify(clippedText) : '');
}
async function spectrum(page, family) {
  await page.evaluate(id => QLOBE_DEBUG.startMode('spectrum').then(() => QLOBE_DEBUG.chooseFamily(id)), family);
  await wait(page, () => QLOBE_DEBUG.getState().phase === 'spectrum-play');
  const cards = page.locator('.card-tray .paper-card-button'); const slots = page.locator('[data-slot="spectrum"]');
  const labels = await cards.evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label')));
  check(`${family} cards have distinct accessible names`, new Set(labels).size === 5 && labels.every(Boolean));
  if (await cards.count() && await slots.count()) {
    const before = (await state(page)).placed.filter(entry => entry != null).length;
    await page.evaluate(() => QLOBE_DEBUG.placeCard(0, 4));
    await wait(page, () => !QLOBE_DEBUG.getState().busy);
    check('wrong spectrum placement preserves progress', (await state(page)).placed.filter(entry => entry != null).length === before);
    const order = Number(await cards.first().getAttribute('data-card-order'));
    const c = await cards.first().boundingBox(); const s = await slots.nth(order).boundingBox();
    await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await page.mouse.down(); await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2, { steps: 5 });
    check('spectrum drag ghost tracks pointer', await page.locator('.qk-drag-ghost').count() === 1); await page.mouse.up();
    await page.waitForFunction(index => QLOBE_DEBUG.getState().placed[index] === index, order);
    check('spectrum correct drag places one card', (await state(page)).placed[order] === order);
    const keyboardCard = cards.first(); const keyboardOrder = Number(await keyboardCard.getAttribute('data-card-order'));
    await keyboardCard.focus(); await page.keyboard.press('Enter'); await slots.nth(keyboardOrder).focus(); await page.keyboard.press('Enter');
    await page.waitForFunction(index => QLOBE_DEBUG.getState().placed[index] === index, keyboardOrder);
    check('spectrum keyboard tap-tap places a card', (await state(page)).placed[keyboardOrder] === keyboardOrder);
    if (family === 'reds') {
      const loose = cards.first(); const looseBox = await loose.boundingBox(); const placedBeforeReturn = (await state(page)).placed.filter(entry => entry != null).length; const viewport = page.viewportSize();
      await page.mouse.move(looseBox.x + looseBox.width / 2, looseBox.y + looseBox.height / 2); await page.mouse.down(); await page.mouse.move(viewport.width - 8, viewport.height / 2, { steps: 5 }); await page.mouse.up();
      check('off-target spectrum drop returns card', (await state(page)).placed.filter(entry => entry != null).length === placedBeforeReturn && await page.locator('.qk-drag-ghost').count() === 0);
    }
  }
  await page.evaluate(() => QLOBE_DEBUG.completeMode()); await wait(page, () => QLOBE_DEBUG.getState().phase === 'spectrum-reward');
}
async function main() {
  await ensureShots(shots); const browser = await launchChrome();
  try {
    const hubSession = await openSession(browser, { url: `${base}/#sensorial-science`, base, viewport: { width: 1180, height: 820 }, ready: false, allowRemote: PLATFORM_ANALYTICS }); sessions.push(hubSession); const hub = hubSession.page;
    await hub.waitForSelector('a.game-card[data-game-id="color-gradient-cards"]');
    const tile = hub.locator('a.game-card[data-game-id="color-gradient-cards"]');
    check('hub tile exists', await tile.count() === 1); check('curated tile path', (await tile.locator('img').getAttribute('src') || '').includes('color-gradient-cards'));
    await tile.click(); await hub.waitForURL('**/games/color-gradient-cards/'); check('hub launches route', hub.url().includes('/games/color-gradient-cards/'));
    const page = await game(browser, { width: 1180, height: 820 });
    check('splash boots', (await state(page)).screen === 'splash'); check('art preload clean', (await state(page)).artFailures.length === 0); await shot(page, '01-splash.png');
    check('three modes registered', (await page.evaluate(() => QLOBE_DEBUG.listModes())).map(x => x.id).join(',') === 'spectrum,mixer,safari');
    for (const family of ['reds', 'blues', 'greens', 'purples', 'rainbow']) { await spectrum(page, family); check(`${family} spectrum completes`, (await state(page)).phase === 'spectrum-reward'); }
    await page.evaluate(() => QLOBE_DEBUG.startMode('mixer')); await wait(page, () => QLOBE_DEBUG.getState().phase === 'mixer-pick'); await shot(page, '02-mixer-pick.png');
    await page.evaluate(() => { QLOBE_DEBUG.tap('primary-red'); QLOBE_DEBUG.tap('well-0'); QLOBE_DEBUG.tap('primary-red'); QLOBE_DEBUG.tap('well-1'); });
    check('mixer same-color rejected', (await state(page)).phase === 'mixer-pick' && (await state(page)).mixerWells.join(',') === 'red,');
    await wait(page, () => !QLOBE_DEBUG.getState().busy);
    const bridges = new Set();
    // Real tap-tap path: select two cards, then tap their wells.
    const mixerWells = page.locator('.mixer-wells [data-well-index]');
    await page.locator('.mixer-tray [data-color="yellow"]').click(); await mixerWells.nth(1).click();
    await wait(page, () => QLOBE_DEBUG.getState().phase === 'mixer-reveal');
    bridges.add((await state(page)).mixerBridge); check('mixer real tap-tap places a bridge', (await state(page)).phase === 'mixer-reveal');
    await page.evaluate(() => QLOBE_DEBUG.winRound()); await wait(page, () => QLOBE_DEBUG.getState().phase === 'mixer-pick');
    // Real pointer-drag path for a second bridge.
    const dragMixer = async (color, wellIndex) => { const card = page.locator(`.mixer-tray [data-color="${color}"]`); const slot = mixerWells.nth(wellIndex); const c = await card.boundingBox(); const s = await slot.boundingBox(); await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await page.mouse.down(); await page.mouse.move(s.x + s.width / 2, s.y + s.height / 2, { steps: 6 }); await page.mouse.up(); };
    const looseMixer = page.locator('.mixer-tray [data-color="blue"]').first(); const looseBox = await looseMixer.boundingBox(); await page.mouse.move(looseBox.x + looseBox.width / 2, looseBox.y + looseBox.height / 2); await page.mouse.down(); await page.mouse.move(page.viewportSize().width - 8, page.viewportSize().height - 8, { steps: 5 }); await page.mouse.up(); check('mixer off-target drop recovers', await page.locator('.qk-drag-ghost').count() === 0 && (await state(page)).mixerWells.join(',') === ',');
    await dragMixer('red', 0); await dragMixer('blue', 1); await wait(page, () => QLOBE_DEBUG.getState().phase === 'mixer-reveal');
    bridges.add((await state(page)).mixerBridge); check('mixer real pointer drag places a bridge', (await state(page)).phase === 'mixer-reveal');
    await page.evaluate(() => QLOBE_DEBUG.winRound()); await wait(page, () => QLOBE_DEBUG.getState().phase === 'mixer-pick');
    await page.evaluate(() => QLOBE_DEBUG.winRound()); if ((await state(page)).phase === 'mixer-reveal') { bridges.add((await state(page)).mixerBridge); await page.evaluate(() => QLOBE_DEBUG.winRound()); }
    check('mixer reveals three distinct bridges', bridges.size === 3); check('mixer reaches end', (await state(page)).screen === 'end'); await shot(page, '03-mixer-end.png');
    await page.evaluate(() => QLOBE_DEBUG.startMode('safari')); await wait(page, () => QLOBE_DEBUG.getState().phase === 'safari-pick'); await shot(page, '04-safari-pick.png');
    const safariLabels = await page.locator('.safari-choice').evaluateAll(nodes => nodes.map(node => node.getAttribute('aria-label'))); check('safari choices have distinct accessible names', new Set(safariLabels).size === 3 && safariLabels.every(Boolean));
    const wrongChoice = page.locator('.safari-choice[data-role="wrong"]').first(); const targetSafari = (await state(page)).safariTarget; await wrongChoice.focus(); await page.keyboard.press('Enter'); await page.locator('.safari-target').focus(); await page.keyboard.press('Enter'); check('safari wrong shade does not advance', (await state(page)).round === 0 && (await state(page)).safariTarget === targetSafari); await wait(page, () => !QLOBE_DEBUG.getState().busy);
    // Real tap-tap path: choose the correct card, then tap the target.
    const correctChoice = page.locator('.safari-choice[data-role="correct"]');
    await correctChoice.click(); await page.locator('.safari-target').click();
    await wait(page, () => QLOBE_DEBUG.getState().phase === 'safari-reveal'); check('safari real tap-tap advances to reveal', true);
    await page.evaluate(() => QLOBE_DEBUG.winRound()); await wait(page, () => QLOBE_DEBUG.getState().phase === 'safari-pick');
    // Real pointer-drag path for the next shade, followed by an off-target recovery.
    const dragSafari = async () => { const card = page.locator('.safari-choice[data-role="correct"]'); const target = page.locator('.safari-target'); const c = await card.boundingBox(); const t = await target.boundingBox(); await page.mouse.move(c.x + c.width / 2, c.y + c.height / 2); await page.mouse.down(); await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 6 }); check('safari drag ghost tracks pointer', await page.locator('.qk-drag-ghost').count() === 1); await page.mouse.up(); };
    const offTarget = page.locator('.safari-choice[data-role="wrong"]').first(); const off = await offTarget.boundingBox(); await page.mouse.move(off.x + off.width / 2, off.y + off.height / 2); await page.mouse.down(); await page.mouse.move(page.viewportSize().width - 8, page.viewportSize().height - 8, { steps: 5 }); await page.mouse.up(); check('safari off-target drop recovers', await page.locator('.qk-drag-ghost').count() === 0 && (await state(page)).phase === 'safari-pick');
    await dragSafari(); await wait(page, () => QLOBE_DEBUG.getState().phase === 'safari-reveal'); check('safari real pointer drag advances to reveal', true);
    await page.evaluate(() => QLOBE_DEBUG.winRound()); await page.evaluate(() => QLOBE_DEBUG.completeMode()); check('safari reaches end', (await state(page)).screen === 'end'); await shot(page, '05-safari-end.png');
    check('real voice clip recorded', await page.evaluate(() => QLOBE_DEBUG.getAudioLog().some(x => x.kind === 'clip' && x.key)));
    for (const vp of [{ width: 820, height: 1180 }, { width: 1366, height: 600 }, { width: 1180, height: 520 }, { width: 375, height: 667 }, { width: 844, height: 390 }]) {
      const p = await game(browser, vp);
      for (const mode of ['spectrum', 'mixer', 'safari']) {
        await p.evaluate((id) => QLOBE_DEBUG.startMode(id), mode);
        if (mode === 'spectrum') {
          await auditViewport(p, vp, 'spectrum-picker');
          await shot(p, `viewport-${vp.width}x${vp.height}-spectrum-picker.png`);
          await p.evaluate(() => QLOBE_DEBUG.chooseFamily('rainbow'));
          await wait(p, () => QLOBE_DEBUG.getState().phase === 'spectrum-play');
        }
        await auditViewport(p, vp, mode);
        await shot(p, `viewport-${vp.width}x${vp.height}-${mode}.png`);
        await p.evaluate(() => QLOBE_DEBUG.completeMode());
        await wait(p, () => QLOBE_DEBUG.getState().phase === (QLOBE_DEBUG.getState().mode === 'spectrum' ? 'spectrum-reward' : 'end'));
        await auditViewport(p, vp, `${mode}-complete`);
        await shot(p, `viewport-${vp.width}x${vp.height}-${mode}-complete.png`);
      }
    }
    const rotated = await game(browser, { width: 820, height: 1180 }); await rotated.evaluate(() => QLOBE_DEBUG.startMode('spectrum').then(() => QLOBE_DEBUG.chooseFamily('reds'))); const rotatingCard = rotated.locator('.card-tray .paper-card-button').first(); const rotatingBox = await rotatingCard.boundingBox(); await rotated.mouse.move(rotatingBox.x + rotatingBox.width / 2, rotatingBox.y + rotatingBox.height / 2); await rotated.mouse.down(); await rotated.mouse.move(rotatingBox.x + rotatingBox.width / 2 + 40, rotatingBox.y + rotatingBox.height / 2 - 40, { steps: 4 }); check('rotation setup has active drag', (await state(rotated)).activeDrag && await rotated.locator('.qk-drag-ghost').count() === 1); await rotated.setViewportSize({ width: 1180, height: 820 }); await wait(rotated, () => !QLOBE_DEBUG.getState().activeDrag); check('resize cancels drag cleanly', await rotated.locator('.qk-drag-ghost').count() === 0); await rotated.mouse.up();
    const reduced = await game(browser, { width: 1180, height: 820 }, 'reduce'); check('reduced motion reported', (await state(reduced)).reducedMotion === true); await shot(reduced, 'reduced-motion.png');
    for (const s of sessions) { s.failed = s.failed.filter(u => !PLATFORM_ANALYTICS.some(p => u.startsWith(p))); checkSessionClean({ check }, s); }
  } finally { await browser.close(); finish(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
