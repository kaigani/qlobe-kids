#!/usr/bin/env node
import path from 'node:path';
import { args, launchChrome, createReporter, openSession, resolveShots, ensureShots } from '../../../tools/qa/lib/driver.mjs';

const base = args.flag('base', 'http://127.0.0.1:8127').replace(/\/$/, '');
const shots = resolveShots('/private/tmp/tangram-layout-helper-shots');
const ids = ['boat', 'fairy', 'whale', 'rabbit', 'boy', 'girl', 'horse', 'candle', 'dog', 'camel', 'bear', 'face', 'house', 'cat', 'duck', 'lion'];
const { check, finish } = createReporter();
await ensureShots(shots);
const browser = await launchChrome();
try {
  const session = await openSession(browser, {
    url: `${base}/games/tangram-tales/tools/layout-helper.html?tale=boat`,
    base,
    viewport: { width: 1440, height: 980 },
    ready: false,
  });
  for (const id of ids) {
    await session.page.selectOption('#tale', id);
    await session.page.waitForFunction((wanted) => new URL(location.href).searchParams.get('tale') === wanted, id);
    const pieceCount = await session.page.locator('.qlobe-freeform-piece').count();
    const targets = JSON.parse(await session.page.locator('#output').inputValue());
    check(`${id} helper loads seven editable targets`, pieceCount === 7 && Object.keys(targets).length === 7);
    await session.page.locator('#stage').screenshot({ path: path.join(shots, `${id}.png`) });
  }

  await session.page.selectOption('#tale', 'boat');
  await session.page.waitForFunction(() => new URL(location.href).searchParams.get('tale') === 'boat');
  const piece = session.page.locator('.qlobe-freeform-piece').last();
  await piece.click();
  const pieceId = await piece.getAttribute('data-freeform-id');
  const sliderState = await session.page.evaluate(() => ({
    rotationType: document.querySelector('#rotation')?.type,
    sizeType: document.querySelector('#size')?.type,
    rotationDisabled: document.querySelector('#rotation')?.disabled,
    sizeDisabled: document.querySelector('#size')?.disabled,
    legacyButtons: document.querySelectorAll('[data-rotate], [data-size]').length,
  }));
  check('rotation and size use enabled sliders with no legacy buttons',
    sliderState.rotationType === 'range'
      && sliderState.sizeType === 'range'
      && !sliderState.rotationDisabled
      && !sliderState.sizeDisabled
      && sliderState.legacyButtons === 0);

  await session.page.locator('#rotation').evaluate((input) => {
    input.value = '37';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await session.page.locator('#size').evaluate((input) => {
    input.value = '0.335';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const adjustedTargets = JSON.parse(await session.page.locator('#output').inputValue());
  check('sliders update the selected piece rotation and size',
    adjustedTargets[pieceId]?.rotation === 37 && adjustedTargets[pieceId]?.size === 0.335,
    JSON.stringify(adjustedTargets[pieceId]));

  check('flip control is limited to the parallelogram',
    await session.page.locator('#flip-horizontal').isDisabled() === (pieceId !== 'parallelogram'));
  const parallelogram = session.page.locator('[data-freeform-id="parallelogram"]');
  await parallelogram.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const options = { bubbles: true, pointerId: 88, isPrimary: true, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, button: 0, buttons: 1 };
    const capture = element.setPointerCapture;
    element.setPointerCapture = () => {};
    element.dispatchEvent(new PointerEvent('pointerdown', options));
    window.dispatchEvent(new PointerEvent('pointerup', { ...options, buttons: 0 }));
    element.setPointerCapture = capture;
  });
  check('parallelogram exposes the horizontal flip control',
    !(await session.page.locator('#flip-horizontal').isDisabled()));
  const initialMirror = await session.page.locator('#flip-horizontal').getAttribute('aria-pressed') === 'true';
  await session.page.locator('#flip-horizontal').click();
  const flippedTargets = JSON.parse(await session.page.locator('#output').inputValue());
  check('horizontal flip is included in the selected target JSON',
    flippedTargets.parallelogram?.mirror === !initialMirror
      && (await session.page.locator('#flip-horizontal').getAttribute('aria-pressed') === String(!initialMirror)),
    JSON.stringify(flippedTargets.parallelogram));

  check('piece dropdown lists all seven individual pieces',
    await session.page.locator('#piece-select option').count() === 7);
  await session.page.selectOption('#piece-select', 'large-a');
  await session.page.locator('#size').evaluate((input) => {
    input.value = '0.305';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const syncedTargets = JSON.parse(await session.page.locator('#output').inputValue());
  check('matching A/B triangle sizes stay synchronized',
    syncedTargets['large-a']?.size === 0.305 && syncedTargets['large-b']?.size === 0.305,
    `${syncedTargets['large-a']?.size} / ${syncedTargets['large-b']?.size}`);
  await session.page.locator('#lock-selection').check();
  const lockState = await session.page.evaluate(() => [...document.querySelectorAll('.qlobe-freeform-piece')]
    .map((element) => ({ id: element.dataset.freeformId, pointerEvents: getComputedStyle(element).pointerEvents })));
  check('selection lock leaves only the selected piece moveable',
    lockState.find((item) => item.id === 'large-a')?.pointerEvents !== 'none'
      && lockState.filter((item) => item.id !== 'large-a').every((item) => item.pointerEvents === 'none'));
  await session.page.locator('#lock-selection').uncheck();

  const beforeHold = adjustedTargets[pieceId]?.rotation;
  const box = await piece.boundingBox();
  await session.page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await session.page.mouse.down();
  await session.page.waitForTimeout(800);
  await session.page.mouse.up();
  const afterHoldTargets = JSON.parse(await session.page.locator('#output').inputValue());
  check('stationary hold does not rotate pieces in the layout helper',
    afterHoldTargets[pieceId]?.rotation === beforeHold,
    `${beforeHold} -> ${afterHoldTargets[pieceId]?.rotation}`);

  check('helper has zero page errors', session.errors.length === 0, session.errors.join(' | '));
  check('helper has zero failed requests', session.failed.length === 0, session.failed.join(' | '));
  await session.context.close();
} finally {
  await browser.close();
}
finish();
