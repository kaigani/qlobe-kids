#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  args, launchChrome, createReporter, openSession, resolveShots, ensureShots,
} from '../../../tools/qa/lib/driver.mjs';

const base = args.flag('base', 'http://127.0.0.1:8127').replace(/\/$/, '');
const shots = resolveShots(path.resolve('games/letter-treasure-hunt/qa-shots'));
const { check, finish } = createReporter();
await ensureShots(shots);

const browser = await launchChrome();
try {
  const session = await openSession(browser, {
    url: `${base}/games/letter-treasure-hunt/tools/layout-editor.html`,
    base,
    viewport: { width: 1440, height: 980 },
    ready: false,
    waitUntil: 'networkidle',
  });
  const { page } = session;

  page.on('dialog', (dialog) => dialog.accept());

  const frameElement = page.locator('#game-preview');
  const overlayCount = async (expected) => {
    await page.waitForFunction(
      (count) => document.querySelector('#game-preview')?.contentDocument
        ?.querySelectorAll('.lth-layout-editor-box').length === count,
      expected,
    );
    return frameElement.evaluate((frame) => frame.contentDocument.querySelectorAll('.lth-layout-editor-box').length);
  };
  const rectValue = async (id) => Number(await page.locator(id).inputValue());

  await page.waitForFunction(() => document.querySelector('#game-preview')?.contentWindow?.QLOBE_DEBUG);
  await overlayCount(5);
  const runtimeErrors = session.errors.filter((message) => !message.startsWith('Failed to load resource:'));
  const localFailures = session.failed.filter((url) => url.startsWith(base));
  check(
    'editor loads without runtime errors or local request failures',
    runtimeErrors.length === 0 && localFailures.length === 0,
    [...runtimeErrors, ...localFailures].join(' | '),
  );
  check(
    'D hunt has five editor boxes and dropdown entries',
    await page.locator('#letter-select').inputValue() === 'D'
      && await page.locator('#mode-select').inputValue() === 'hunt'
      && await overlayCount(5) === 5
      && await page.locator('#item-select option').count() === 5,
  );
  const playAttempt = await frameElement.evaluate((frame) => {
    const debug = frame.contentWindow.QLOBE_DEBUG;
    frame.contentDocument.querySelector('.lth-hotspot[data-target="dog"]')?.click();
    return { authoringPreview: debug.authoringPreview, found: debug.getState().found };
  });
  check(
    'authoring preview disables the playable interaction layer',
    playAttempt.authoringPreview === true && playAttempt.found === 0,
  );

  await page.locator('#item-select').selectOption('target:dog');
  const xBefore = await rectValue('#rect-x');
  await page.locator('#rect-x').fill(String(xBefore + 2));
  await page.locator('#rect-x').press('Tab');
  const xCheck = await page.evaluate(() => ({
    json: JSON.parse(document.querySelector('#json-output').value),
    box: document.querySelector('#game-preview').contentDocument
      .querySelector('[data-editor-key="target:dog"]')?.style.left,
  }));
  check(
    'numeric X updates JSON and iframe position',
    xCheck.json.hunt?.targets?.dog?.x === xBefore + 2 && xCheck.box === `${xBefore + 2}%`,
  );
  await page.locator('#rect-x').fill('');
  const xWhileBlank = await page.evaluate(() => JSON.parse(document.querySelector('#json-output').value).hunt.targets.dog.x);
  check('clearing a numeric field does not move the object', xWhileBlank === xBefore + 2);

  const yBefore = await rectValue('#rect-y');
  const dragPoint = await frameElement.evaluate((frame) => {
    const rect = frame.contentDocument.querySelector('[data-editor-key="target:dog"]').getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  const iframeBox = await frameElement.boundingBox();
  await page.mouse.move(iframeBox.x + dragPoint.x, iframeBox.y + dragPoint.y);
  await page.mouse.down();
  await page.mouse.move(iframeBox.x + dragPoint.x, iframeBox.y + dragPoint.y + 20, { steps: 4 });
  await page.mouse.up();
  check('pointer drag changes Y', await rectValue('#rect-y') > yBefore);

  const widthBefore = await rectValue('#rect-w');
  const heightBefore = await rectValue('#rect-h');
  const resizePoint = await frameElement.evaluate((frame) => {
    const rect = frame.contentDocument
      .querySelector('[data-editor-key="target:dog"] .lth-layout-editor-resize')
      .getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  await page.mouse.move(iframeBox.x + resizePoint.x, iframeBox.y + resizePoint.y);
  await page.mouse.down();
  await page.mouse.move(iframeBox.x + resizePoint.x + 30, iframeBox.y + resizePoint.y + 20, { steps: 4 });
  await page.mouse.up();
  check(
    'resize handle changes width and height',
    await rectValue('#rect-w') > widthBefore && await rectValue('#rect-h') > heightBefore,
  );

  await page.locator('#letter-select').selectOption('Z');
  await overlayCount(5);
  check(
    'switching to Z reloads five matching overlays',
    await page.locator('#item-select option').count() === 5,
  );
  await page.locator('#mode-select').selectOption('completion');
  check('completion mode yields four editable overlays', await overlayCount(4) === 4);
  check('completion art exposes stable semantic target IDs', await frameElement.evaluate((frame) => {
    const ids = [...frame.contentDocument.querySelectorAll('.lth-completion-target')]
      .map((target) => target.dataset.layoutId).sort();
    return ids.join('|') === 'zebra|zipper|zucchini';
  }));

  for (const [name, ratio] of [
    ['standard', '1180/820'], ['wide', '2048/987'], ['compact', '667/375'],
  ]) {
    await page.locator(`button[data-viewport="${name}"]`).click();
    const actual = await page.locator('#preview-shell').evaluate((element) => element.style.aspectRatio.replace(/\s/g, ''));
    check(`${name} viewport updates preview aspect ratio`, actual === ratio);
    const cover = await frameElement.evaluate((frame) => {
      const stage = frame.contentDocument.querySelector('.lth-completion-scene-stage');
      const rect = stage.getBoundingClientRect();
      const { innerWidth: width, innerHeight: height } = frame.contentWindow;
      return {
        aspect: rect.width / rect.height,
        covers: rect.width + 1 >= width && rect.height + 1 >= height,
        centered: Math.abs(rect.left + rect.width / 2 - width / 2) < 1
          && Math.abs(rect.top + rect.height / 2 - height / 2) < 1,
      };
    });
    check(`${name} completion stage stays on the 4:3 cover crop`, Math.abs(cover.aspect - 4 / 3) < 0.01 && cover.covers && cover.centered);
  }

  await page.locator('#show-guides').check();
  check(
    'show-guides toggles iframe guide class',
    await frameElement.evaluate((frame) => frame.contentDocument.querySelector('.lth-layout-editor-guides') !== null),
  );

  await page.locator('#save-draft').click();
  check('Save draft writes a versioned D-Z document', await page.evaluate(() => {
    const draft = JSON.parse(localStorage.getItem('letter-treasure-hunt-layout-draft-v2'));
    return draft?.version === 2 && Object.keys(draft.letters || {}).length === 23;
  }));

  await page.reload({ waitUntil: 'networkidle' });
  await overlayCount(5);
  check(
    'saved draft survives reload',
    ['Restored browser draft', 'Unsaved layout changes'].includes((await page.locator('#save-status').textContent()).trim()),
  );

  await page.locator('#reset-letter').click();
  await overlayCount(5);
  check(
    'reset letter restores committed D coordinates',
    Number(await page.locator('#rect-x').inputValue()) === xBefore,
  );

  const currentLetterJson = JSON.parse(await page.locator('#json-output').inputValue());
  check(
    'selection JSON remains a three-target letter record',
    currentLetterJson.letter === 'd'
      && Object.keys(currentLetterJson.hunt.targets).length === 3
      && Object.keys(currentLetterJson.completion.targets).length === 3,
  );

  await page.screenshot({ path: path.join(shots, 'layout-editor.png'), fullPage: true });

  await page.route('**/api/studio/document?path=*', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 350));
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.locator('#rect-x').fill('4');
  await page.locator('#save-project').click();
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('Saving'));
  await page.locator('#rect-x').fill('5');
  await page.waitForFunction(() => document.querySelector('#save-status').textContent.includes('newer edits remain unsaved'));
  check(
    'an edit made during save remains dirty and protected as a draft',
    await page.evaluate(() => {
      const draft = JSON.parse(localStorage.getItem('letter-treasure-hunt-layout-draft-v2'));
      return draft.letters.d.hunt.targets.dog.x === 5
        && document.querySelector('#save-status').dataset.tone === 'dirty';
    }),
  );
  await page.unroute('**/api/studio/document?path=*');

  await page.evaluate(() => localStorage.removeItem('letter-treasure-hunt-layout-draft-v2'));
  await session.context.close();

  const canonical = JSON.parse(fs.readFileSync(path.resolve('games/letter-treasure-hunt/data/dz-scene-layouts.json'), 'utf8'));
  const fallbackFor = async (documentValue) => {
    const fallbackContext = await browser.newContext({ viewport: { width: 1180, height: 820 } });
    await fallbackContext.route('**/games/letter-treasure-hunt/data/dz-scene-layouts.json', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(documentValue),
    }));
    const fallbackPage = await fallbackContext.newPage();
    await fallbackPage.goto(`${base}/games/letter-treasure-hunt/index.html`, { waitUntil: 'domcontentloaded' });
    await fallbackPage.waitForFunction(() => window.QLOBE_DEBUG);
    await fallbackPage.evaluate(async () => window.QLOBE_DEBUG.startMode('d-quest'));
    const fallback = await fallbackPage.locator('.lth-target-dog').evaluate((target) => ({
      left: target.style.left,
      width: target.style.width,
      tight: target.classList.contains('has-tight-art'),
      trimmedImage: target.querySelector('img')?.classList.contains('is-alpha-trimmed'),
    }));
    await fallbackContext.close();
    return fallback;
  };
  const incompleteTrims = structuredClone(canonical);
  delete incompleteTrims.artTrims['../assets/papercraft/d-hunt/dog.webp'];
  const trimFallback = await fallbackFor(incompleteTrims);
  check(
    'incomplete trim metadata safely restores the built-in island geometry',
    trimFallback.left === '3%' && trimFallback.width === '27%' && !trimFallback.tight && !trimFallback.trimmedImage,
    JSON.stringify(trimFallback),
  );
  const incompleteRects = structuredClone(canonical);
  delete incompleteRects.letters.d.hunt.targets.dog;
  const rectFallback = await fallbackFor(incompleteRects);
  check(
    'incomplete v2 rectangles atomically restore untrimmed built-in geometry',
    rectFallback.left === '3%' && rectFallback.width === '27%' && !rectFallback.tight && !rectFallback.trimmedImage,
    JSON.stringify(rectFallback),
  );
} finally {
  await browser.close();
}
finish();
