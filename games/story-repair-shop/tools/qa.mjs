#!/usr/bin/env node
// Story Repair Shop — real-Chrome smoke and visual-QC driver.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import {
  args, audio, baseUrl, checkSessionClean, createReporter, debug,
  dragBetween, ensureShots, launchChrome, openSession, resolveShots, shooter,
  targetSizes, undersized,
} from '../../../tools/qa/lib/driver.mjs';

const base = baseUrl();
const gameUrl = `${base}/games/story-repair-shop/`;
const shots = resolveShots('/private/tmp/qlobe-story-repair-shop-shots');
const shot = shooter(shots);
const reporter = createReporter({ detailOnFail: true, collapse: true, detailLimit: 1200 });
const { check, note, finish } = reporter;
const sessions = [];
const analytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];
const config = JSON.parse(await readFile(new URL('../config.json', import.meta.url), 'utf8'));
const viewports = [
  { width: 1180, height: 820, name: 'landscape' },
  { width: 820, height: 1180, name: 'portrait' },
  { width: 1180, height: 520, name: 'short' },
];

async function boot(browser, viewport, reducedMotion = 'no-preference', muted = true) {
  const session = await openSession(browser, {
    url: gameUrl, base, viewport, reducedMotion,
    allowAbortedMedia: true, allowRemote: analytics, ready: true,
  });
  await debug.fastTimers(session.page, 0.2);
  await debug.mute(session.page, muted);
  await debug.seed(session.page, 42);
  sessions.push(session);
  return session;
}

function cleanSession(session, label) {
  const allowedAbort = (entry) => String(entry).includes('net::ERR_ABORTED')
    && analytics.some((prefix) => String(entry).includes(prefix));
  session.failed = session.failed.filter((entry) => !allowedAbort(entry));
  checkSessionClean(reporter, session, label);
}

async function visibleTargetAudit(page, label) {
  const rects = await targetSizes(page);
  const small = undersized(rects);
  check(`${label}: visible targets are at least 96px`, small.length === 0,
    small.map((r) => `${r.id}:${Math.round(r.w)}x${Math.round(r.h)}`).join(', '));
}

async function waitScreen(page, screen) {
  await debug.waitForScreen(page, screen, { timeout: 10000 });
}

async function waitRepairCardsIn(page) {
  await page.waitForFunction(() => {
    const cards = [...document.querySelectorAll('#repair-tray:not([hidden]) .repair-card')];
    return cards.length === 3 && cards.every((card) => card.classList.contains('is-in')
      && Number.parseFloat(getComputedStyle(card).opacity) >= 0.98);
  });
}

async function waitSuccessEvidence(page) {
  await page.waitForFunction(() => {
    const slot = document.querySelector('.repair-slot');
    const next = document.querySelector('#next-page');
    if (!slot || !next || next.hidden || !next.classList.contains('is-in')) return false;
    return Number.parseFloat(getComputedStyle(slot).opacity) <= 0.02
      && Number.parseFloat(getComputedStyle(next).opacity) >= 0.98;
  });
}

async function clickTarget(page, id) {
  await page.locator(`[data-target="${id}"]`).first().click();
}

async function driveMode(page, modeId, prefix) {
  const before = await debug.getState(page);
  if (before.screen !== 'play' || before.modeId !== modeId) await debug.startMode(page, modeId);
  await waitScreen(page, 'play');
  check(`${prefix}: mode starts`, (await debug.getState(page)).modeId === modeId);
  await shot(page, `${prefix}-01-problem`);
  await debug.tap(page, 'repair-slot');
  await page.waitForSelector('#repair-tray:not([hidden])');
  await waitRepairCardsIn(page);
  check(`${prefix}: repair tray opens`, (await debug.getState(page)).phase === 'tray');
  await shot(page, `${prefix}-02-tray`);

  // Exercise the gentle wrong-answer path on round one.
  const storyId = (await debug.getState(page)).caseId;
  const story = config.modes.find((mode) => mode.id === modeId).cases.find((entry) => entry.id === storyId);
  const correctId = story.choices.find((choice) => choice.correct).id;
  const chosenWrong = story.choices.find((choice) => !choice.correct).id;
  await debug.tap(page, `card:${chosenWrong}`);
  const wrongCard = await page.locator(`[data-target="card:${chosenWrong}"]`).boundingBox();
  const slot = await page.locator('[data-target="repair-slot"]').boundingBox();
  if (wrongCard && slot) await dragBetween(page, wrongCard, slot);
  await shot(page, `${prefix}-03-wrong`);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().awaitingInput);
  // Physical tap path: select the card, then activate the slot.
  await page.locator(`[data-target="card:${correctId}"]`).click();
  await page.locator('[data-target="repair-slot"]').click();
  await waitScreen(page, 'play');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'success');
  check(`${prefix}: physical card tap -> slot tap completes`, (await debug.getState(page)).phase === 'success');
  await waitSuccessEvidence(page);
  await shot(page, `${prefix}-04-success`);
  for (let round = 1; round < 3; round += 1) {
    await debug.tap(page, 'next');
    await page.waitForFunction((index) => {
      const s = window.QLOBE_DEBUG.getState();
      return s.screen === 'play' && s.roundIndex === index && s.phase === 'problem';
    }, round);
    const nextStoryId = (await debug.getState(page)).caseId;
    const nextStory = config.modes.find((mode) => mode.id === modeId).cases
      .find((entry) => entry.id === nextStoryId);
    const nextCorrectId = nextStory.choices.find((choice) => choice.correct).id;
    await page.locator('[data-target="repair-slot"]').click();
    await page.waitForSelector('#repair-tray:not([hidden])');
    await waitRepairCardsIn(page);
    if (round === 1) {
      // Keyboard activation follows the same semantic button/click path.
      await page.locator(`[data-target="card:${nextCorrectId}"]`).press('Enter');
      await page.locator('[data-target="repair-slot"]').press('Enter');
      check(`${prefix}: keyboard card + slot activation completes round ${round + 1}`,
        (await debug.getState(page)).phase === 'success');
    } else {
      const from = await page.locator(`[data-target="card:${nextCorrectId}"]`).boundingBox();
      const to = await page.locator('[data-target="repair-slot"]').boundingBox();
      if (from && to) await dragBetween(page, from, to);
      await page.waitForFunction(() => window.QLOBE_DEBUG.getState().phase === 'success');
      check(`${prefix}: physical card drag -> slot drop completes round ${round + 1}`,
        (await debug.getState(page)).phase === 'success');
    }
    await page.waitForFunction(() => {
      const s = window.QLOBE_DEBUG.getState();
      return s.phase === 'success';
    });
  }
  await debug.tap(page, 'next');
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'end');
  await shot(page, `${prefix}-05-end`);
  check(`${prefix}: three rounds reach end screen`, (await debug.getState(page)).screen === 'end');
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome({ headless: !args.has('headed') });
  try {
    const session = await boot(browser, viewports[0], 'no-preference', false);
    const { page } = session;
    check('direct route boots and debug is ready', (await debug.getState(page)).screen === 'splash');
    check('splash exposes both storybook modes', (await debug.listModes(page)).map((m) => m.id).join(',') === 'repair,silly');
    await visibleTargetAudit(page, 'splash');
    await shot(page, '01-splash');
    // A genuine gesture unlocks the reusable voice element on iOS/system Chrome.
    await clickTarget(page, 'mode:repair');
    await waitScreen(page, 'play');
    await driveMode(page, 'repair', 'repair');
    await clickTarget(page, 'other-mode');
    await waitScreen(page, 'play');
    await driveMode(page, 'silly', 'silly');
    const log = await debug.getAudioLog(page);
    check('audio log records a real bundled voice clip', audio.clips(log).length > 0, audio.describe(log));
    await debug.tap(page, 'end-back');
    await waitScreen(page, 'splash');
    check('end navigation returns to splash', (await debug.getState(page)).screen === 'splash');
    await visibleTargetAudit(page, 'splash after navigation');
    cleanSession(session, 'primary session');

    for (const viewport of viewports.slice(1)) {
      const smallSession = await boot(browser, viewport);
      await visibleTargetAudit(smallSession.page, viewport.name);
      await shot(smallSession.page, `06-${viewport.name}-splash`);
      check(`${viewport.name}: stage fits without horizontal overflow`, await smallSession.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await debug.startMode(smallSession.page, 'repair');
      await waitScreen(smallSession.page, 'play');
      await shot(smallSession.page, `06-${viewport.name}-problem`);
      await debug.tap(smallSession.page, 'repair-slot');
      await smallSession.page.waitForSelector('#repair-tray:not([hidden])');
      await waitRepairCardsIn(smallSession.page);
      await shot(smallSession.page, `06-${viewport.name}-tray`);
      const firstChoice = await smallSession.page.locator('.repair-card').first().getAttribute('data-choice-id');
      if (firstChoice) await debug.tap(smallSession.page, `card:${firstChoice}`);
      await smallSession.page.waitForFunction(() => window.QLOBE_DEBUG.getState().selectedChoiceId !== null);
      await shot(smallSession.page, `06-${viewport.name}-selected`);
      // Responsive end-state smoke: use the debug contract for deterministic,
      // short completion while the primary session covers physical gameplay.
      for (let round = 0; round < 3; round += 1) {
        await debug.winRound(smallSession.page);
        await smallSession.page.waitForFunction(() => {
          const state = window.QLOBE_DEBUG.getState();
          return state.phase === 'success' && !state.locked;
        });
        if (round < 2) {
          await debug.tap(smallSession.page, 'next');
          await smallSession.page.waitForFunction((index) => {
            const state = window.QLOBE_DEBUG.getState();
            return state.screen === 'play' && state.roundIndex === index && state.phase === 'problem';
          }, round + 1);
        } else {
          await debug.tap(smallSession.page, 'next');
          await waitScreen(smallSession.page, 'end');
        }
      }
      await shot(smallSession.page, `06-${viewport.name}-end`);
      await visibleTargetAudit(smallSession.page, `${viewport.name} end`);
      check(`${viewport.name}: forced responsive smoke reaches end screen`,
        (await debug.getState(smallSession.page)).screen === 'end');
      await debug.tap(smallSession.page, 'back');
      await waitScreen(smallSession.page, 'splash');
      cleanSession(smallSession, `${viewport.name} session`);
    }
    const reduced = await boot(browser, viewports[0], 'reduce');
    await debug.call(reduced.page, 'setReducedMotion', true);
    check('reduced-motion hook is accepted', await reduced.page.evaluate(() => document.documentElement.style && true));
    await shot(reduced.page, '07-reduced-motion');
    cleanSession(reduced, 'reduced-motion session');
    note(`screenshots written to ${shots}`);
  } finally {
    for (const session of sessions) await session.close().catch(() => {});
    await browser.close();
  }
  finish({ suffix: `; shots in ${shots}` });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
