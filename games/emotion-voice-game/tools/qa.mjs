#!/usr/bin/env node

import path from 'node:path';
import {
  args, launchChrome, createReporter, openSession,
  resolveShots, ensureShots, checkSessionClean,
} from '../../../tools/qa/lib/driver.mjs';

const base = args.flag('base', 'http://127.0.0.1:8011').replace(/\/$/, '');
const url = `${base}/games/emotion-voice-game/`;
const shots = resolveShots('games/emotion-voice-game/qa-shots/emotion-voice-game');
const reporter = createReporter();
const { check, finish } = reporter;

async function openGame(browser, viewport, reducedMotion = 'no-preference', context = {}, mute = true) {
  const session = await openSession(browser, {
    url, base, viewport, reducedMotion, context,
    readyWhen: () => document.documentElement.dataset.ready === 'true',
    after: (page) => page.evaluate(() => {
      window.QLOBE_DEBUG.setMicMode('fake');
    }),
  });
  if (mute) await session.page.evaluate(() => window.QLOBE_DEBUG.mute(true));
  return session;
}

async function targetAudit(page, label) {
  const { targets, width, height } = await page.evaluate(() => ({
    targets: window.QLOBE_DEBUG.getTargets(), width: innerWidth, height: innerHeight,
  }));
  const bad = targets.filter(({ rect }) => rect.w < 95.5 || rect.h < 95.5
    || rect.x < -1 || rect.y < -1
    || rect.x + rect.w > width + 1 || rect.y + rect.h > height + 1);
  check(`${label} targets are visible and at least 96px`, bad.length === 0, JSON.stringify(bad));
}

async function drive(browser) {
  const landscape = await openGame(browser, { width: 1180, height: 820 });
  const page = landscape.page;
  check('splash boots with four emotion choices',
    (await page.locator('.emotion-card').count()) === 4
      && (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('title is authored raster art', await page.locator('.title-art').getAttribute('src') === 'assets/title.webp');
  await targetAudit(page, 'landscape splash');
  await page.screenshot({ path: path.join(shots, '01-splash-landscape.png') });

  const wide = await openGame(browser, { width: 2048, height: 1024 });
  const wideLayout = await wide.page.evaluate(() => {
    const row = document.getElementById('emotion-cards').getBoundingClientRect();
    const card = document.querySelector('.emotion-card').getBoundingClientRect();
    const label = document.querySelector('.emotion-card span').getBoundingClientRect();
    return {
      rowCenterDelta: Math.round(Math.abs(row.left + row.width / 2 - innerWidth / 2)),
      rowTop: Math.round(row.top),
      labelTopRatio: Number(((label.top - card.top) / card.height).toFixed(3)),
      labelBottomRatio: Number(((label.bottom - card.top) / card.height).toFixed(3)),
    };
  });
  check('wide splash centers the choice row in the theater',
    wideLayout.rowCenterDelta <= 2 && wideLayout.rowTop >= 320 && wideLayout.rowTop <= 400,
    JSON.stringify(wideLayout));
  check('choice labels sit inside the beige card inset',
    wideLayout.labelTopRatio >= .70 && wideLayout.labelBottomRatio <= .86,
    JSON.stringify(wideLayout));
  await wide.page.screenshot({ path: path.join(shots, '08-splash-wide-centered.png') });

  await page.locator('[data-target="emotion-proud"]').click();
  await page.waitForFunction(() => !document.getElementById('mic-button').disabled);
  check('proud choice opens the performance stage',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().emotion)) === 'proud');
  await targetAudit(page, 'performance');
  await page.screenshot({ path: path.join(shots, '02-proud-ready.png') });

  await page.locator('[data-target="mic"]').click();
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'result');
  await page.waitForTimeout(750);
  check('local voice pass reaches a proud celebration',
    (await page.locator('#result-title').textContent()) === 'proud!');
  check('debug state exposes analyzed voice features',
    Boolean((await page.evaluate(() => window.QLOBE_DEBUG.getState().lastSummary))?.heard));
  await targetAudit(page, 'result');
  await page.screenshot({ path: path.join(shots, '03-proud-result.png') });

  await page.locator('[data-target="next"]').click();
  check('next returns to the in-page feeling chooser',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().screen)) === 'splash');
  check('completed feeling receives a visible star', await page.locator('[data-target="emotion-proud"].done').count() === 1);

  for (const id of ['happy', 'calm', 'silly']) {
    await page.locator(`[data-target="emotion-${id}"]`).click();
    await page.waitForFunction(() => !document.getElementById('mic-button').disabled);
    await page.locator('[data-target="mic"]').click();
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'result');
    if (id === 'silly') {
      const mouthRect = await page.evaluate(() => {
        const mouth = document.getElementById('result-mouth');
        mouth.src = './assets/characters/teddy/anim/mouth-a.png';
        mouth.classList.add('talking');
        const rect = mouth.getBoundingClientRect();
        const puppet = document.getElementById('result-puppet').getBoundingClientRect();
        return {
          visible: getComputedStyle(mouth).opacity === '1',
          inside: rect.left >= puppet.left && rect.top >= puppet.top
            && rect.right <= puppet.right && rect.bottom <= puppet.bottom,
          w: rect.width, h: rect.height,
        };
      });
      check('Teddy viseme overlay is visible and registered inside the silly pose',
        mouthRect.visible && mouthRect.inside && mouthRect.w > 40 && mouthRect.h > 30,
        JSON.stringify(mouthRect));
      await page.screenshot({ path: path.join(shots, '07-silly-viseme-registration.png') });
      await page.evaluate(() => document.getElementById('result-mouth').classList.remove('talking'));
    }
    if (id !== 'silly') await page.locator('[data-target="next"]').click();
  }
  check('all four feelings complete the full show',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed.length)) === 4);
  check('the completed show offers an Encore', (await nextButtonText(page)) === 'Encore!');
  await page.locator('[data-target="next"]').click();
  check('Encore resets progress for a new show',
    (await page.evaluate(() => window.QLOBE_DEBUG.getState().completed.length)) === 0);

  const denied = await openGame(browser, { width: 1024, height: 768 }, 'no-preference', { permissions: [] });
  await denied.page.locator('[data-target="emotion-happy"]').click();
  await denied.page.waitForFunction(() => !document.getElementById('mic-button').disabled);
  await denied.page.evaluate(() => window.QLOBE_DEBUG.setMicMode('real'));
  await denied.page.locator('[data-target="mic"]').click();
  await denied.page.waitForFunction(() => !document.getElementById('fallback-button').hidden);
  check('microphone denial reveals the no-mic performance fallback', await denied.page.locator('[data-target="fallback"]').isVisible());
  await denied.page.locator('[data-target="fallback"]').click();
  await denied.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'result');
  check('no-mic fallback still completes the emotional performance', true);

  const portrait = await openGame(browser, { width: 820, height: 1180 }, 'no-preference', {
    deviceScaleFactor: 2, hasTouch: true, isMobile: true,
  });
  await targetAudit(portrait.page, 'portrait splash');
  check('portrait has no horizontal overflow',
    await portrait.page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth));
  await portrait.page.screenshot({ path: path.join(shots, '04-splash-portrait.png') });
  await portrait.page.locator('[data-target="emotion-calm"]').click();
  await portrait.page.waitForFunction(() => !document.getElementById('mic-button').disabled);
  await portrait.page.screenshot({ path: path.join(shots, '05-calm-portrait.png') });

  const reduced = await openGame(browser, { width: 1180, height: 620 }, 'reduce');
  await reduced.page.locator('[data-target="emotion-silly"]').click();
  await reduced.page.waitForFunction(() => !document.getElementById('mic-button').disabled);
  await reduced.page.locator('[data-target="mic"]').click();
  await reduced.page.waitForFunction(() => window.QLOBE_DEBUG.getState().screen === 'result');
  await reduced.page.waitForTimeout(750);
  check('reduced-motion path completes without animation dependence', true);
  await reduced.page.screenshot({ path: path.join(shots, '06-silly-compact-reduced.png') });

  const voiced = await openGame(browser, { width: 1180, height: 820 }, 'no-preference', {}, false);
  await voiced.page.locator('[data-target="emotion-happy"]').click();
  await voiced.page.waitForFunction(() => document.getElementById('actor-mouth').classList.contains('talking'));
  await voiced.page.waitForFunction(() => !document.getElementById('actor-mouth').src.endsWith('mouth-rest.png'));
  const voicedState = await voiced.page.evaluate(() => ({
    last: window.QLOBE_DEBUG.getAudioLog().at(-1),
    mouth: document.getElementById('actor-mouth').src.split('/').pop(),
  }));
  check('Happy model uses a recorded Bear clip instead of device speech',
    voicedState.last?.key === 'happy-model' && voicedState.last?.kind === 'clip',
    JSON.stringify(voicedState.last));
  check('recorded Bear clip advances Teddy beyond the rest viseme',
    voicedState.mouth !== 'mouth-rest.png', voicedState.mouth);
  await voiced.page.waitForFunction(() => !document.getElementById('mic-button').disabled, null, { timeout: 12000 });
  check('Teddy returns to the baked expression after narration ends',
    !(await voiced.page.locator('#actor-mouth').getAttribute('class')).includes('talking'));

  for (const [label, session] of [['landscape', landscape], ['wide', wide], ['mic-denied', denied], ['portrait', portrait], ['reduced', reduced], ['recorded-voice', voiced]]) {
    checkSessionClean(reporter, session, label);
    await session.close();
  }
}

async function nextButtonText(page) {
  return page.locator('[data-target="next"]').textContent();
}

async function main() {
  await ensureShots(shots);
  const browser = await launchChrome();
  try {
    await drive(browser);
  } finally {
    await browser.close();
    finish({ suffix: `; shots in ${shots}`, listFailures: false });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
