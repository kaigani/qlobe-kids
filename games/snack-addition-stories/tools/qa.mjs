// Production Chrome smoke + visual-capture suite for Snack Addition Stories.
// Usage: node games/snack-addition-stories/tools/qa.mjs <base-url> [label]
import { mkdirSync } from 'node:fs';
import { launchChrome } from '../../../tools/qa/lib/driver.mjs';

const base = (process.argv[2] || 'http://localhost:4173').replace(/\/$/, '');
const label = (process.argv[3] || 'local').replace(/[^a-z0-9-]/gi, '-').toLowerCase();
const url = `${base}/games/snack-addition-stories/`;
const shots = `games/snack-addition-stories/assets/source/qa/runtime-${label}`;
mkdirSync(shots, { recursive: true });

const browser = await launchChrome();
const page = await browser.newPage({ viewport: { width: 1024, height: 768 } });
const errors = [];
const requestFailures = [];
const gameOrigin = new URL(base).origin;

page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`);
});
page.on('pageerror', (error) => errors.push(`page: ${error.message}`));
page.on('requestfailed', (request) => {
  const reason = request.failure()?.errorText || 'failed';
  if (reason === 'net::ERR_ABORTED' && request.resourceType() === 'media') return;
  if (new URL(request.url()).origin === gameOrigin) requestFailures.push(`${reason} ${request.url()}`);
});
page.on('response', (response) => {
  if (new URL(response.url()).origin === gameOrigin && response.status() >= 400) {
    requestFailures.push(`HTTP ${response.status()} ${response.url()}`);
  }
});

const shot = (name) => page.screenshot({ path: `${shots}/${name}.png` });
const debug = (expression, argument) => page.evaluate(expression, argument);
const waitState = (predicate) => page.waitForFunction(predicate, undefined, { timeout: 10_000 });
const separatedBy = (a, b, gap = 0) => (
  a.x + a.w + gap <= b.x
  || b.x + b.w + gap <= a.x
  || a.y + a.h + gap <= b.y
  || b.y + b.h + gap <= a.y
);
const promptAudit = () => debug(() => {
  const plaque = document.querySelector('#prompt-plaque');
  const image = plaque?.querySelector('img');
  const textNode = document.querySelector('#prompt-text')?.firstChild;
  if (!plaque || !image || !textNode) return null;
  const box = image.getBoundingClientRect();
  const ratio = image.naturalWidth / image.naturalHeight;
  const fit = getComputedStyle(image).objectFit;
  let art = { x: box.x, y: box.y, w: box.width, h: box.height };
  if (fit === 'contain' && ratio > 0) {
    const width = Math.min(box.width, box.height * ratio);
    const height = Math.min(box.height, box.width / ratio);
    art = { x: box.x + (box.width - width) / 2, y: box.y + (box.height - height) / 2, w: width, h: height };
  }
  const range = document.createRange();
  range.selectNodeContents(document.querySelector('#prompt-text'));
  const glyph = range.getBoundingClientRect();
  const inset = 12;
  return {
    art,
    glyph: { x: glyph.x, y: glyph.y, w: glyph.width, h: glyph.height },
    fits: glyph.x >= art.x + inset
      && glyph.y >= art.y + inset
      && glyph.right <= art.x + art.w - inset
      && glyph.bottom <= art.y + art.h - inset,
  };
});

await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.QLOBE_DEBUG?.ready);
await debug(() => QLOBE_DEBUG.ready);
await debug(() => {
  QLOBE_DEBUG.fastTimers(0.035);
  QLOBE_DEBUG.seed(424242);
  QLOBE_DEBUG.clearAudioLog();
});
await shot('01-splash-1024x768');

const modes = await debug(() => QLOBE_DEBUG.listModes());
if (modes.map(({ id }) => id).join(',') !== 'guided,counter,picnic') {
  throw new Error(`unexpected mode list: ${JSON.stringify(modes)}`);
}

// A real pointer gesture must unlock and start the shared BGM channel.
await page.click('[data-target="mode:counter"]');
await waitState(() => QLOBE_DEBUG.getState().screen === 'play');
await page.waitForTimeout(120);
const musicStarted = await debug(async () => (await import('/shared/js/bgm.js')).stats());
if (!musicStarted.key) throw new Error('background music did not start from a real mode gesture');
await debug(() => QLOBE_DEBUG.home());
await page.waitForTimeout(650);
const musicStopped = await debug(async () => (await import('/shared/js/bgm.js')).stats());
if (musicStopped.key || musicStopped.playing) throw new Error('background music did not stop on splash return');

// Guided story: selector, before-add, answer, gentle retry, and success.
await debug(async () => QLOBE_DEBUG.startMode('guided'));
await waitState(() => QLOBE_DEBUG.getState().screen === 'story-select');
await shot('02-story-select-1024x768');
await debug(async () => QLOBE_DEBUG.chooseTheme('berry'));
await waitState(() => QLOBE_DEBUG.getState().phase === 'staging');
await shot('03-guided-before-add-1024x768');
const guidedPromptAudit = await promptAudit();
if (!guidedPromptAudit?.fits) throw new Error(`guided prompt escaped its raster plaque: ${JSON.stringify(guidedPromptAudit)}`);
// The first round intentionally tells the one-time interaction instruction
// before its story. Wait until the story clip starts so the smoke drive does
// not behave like an impatient tap that interrupts narration mid-sentence.
const firstGuidedRound = await debug(() => QLOBE_DEBUG.getState().roundId);
await page.waitForFunction(
  (key) => QLOBE_DEBUG.getAudioLog().some((event) => event.key === `${key}-prompt` && event.kind === 'clip'),
  firstGuidedRound,
  { timeout: 20_000 },
);
await debug(async () => QLOBE_DEBUG.tap('add-group'));
await waitState(() => QLOBE_DEBUG.getState().phase === 'answer');
await shot('04-guided-answer-1024x768');

const guidedCount = await page.locator('.tray-scene .tray-snack').count();
const guidedState = await debug(() => QLOBE_DEBUG.getState());
if (guidedCount !== guidedState.total) throw new Error(`tray rendered ${guidedCount} snacks for total ${guidedState.total}`);

const wrongTarget = await debug(() => {
  const state = QLOBE_DEBUG.getState();
  return QLOBE_DEBUG.getTargets().find((target) => target.role === 'answer' && target.id !== `answer:${state.total}`)?.id;
});
if (!wrongTarget) throw new Error('guided answer rail had no wrong-answer probe');
await debug((id) => QLOBE_DEBUG.tap(id), wrongTarget);
if ((await debug(() => QLOBE_DEBUG.getState())).phase !== 'answer') throw new Error('wrong answer escaped gentle retry');
await page.waitForTimeout(120);
await shot('05-guided-gentle-retry-1024x768');
await debug(async () => {
  const state = QLOBE_DEBUG.getState();
  await QLOBE_DEBUG.tap(`answer:${state.total}`);
});
await waitState(() => QLOBE_DEBUG.getState().phase === 'success');
await page.waitForTimeout(850);
await shot('06-guided-success-1024x768');
const baselineSuccessGeometry = await debug(() => {
  const rect = (selector) => {
    const box = document.querySelector(selector)?.getBoundingClientRect();
    return box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null;
  };
  return {
    equation: rect('.equation-plaque'),
    next: rect('.next-action'),
    banner: rect('.success-banner'),
    snacks: [...document.querySelectorAll('.tray-snack')].map((node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    }),
  };
});
if (!separatedBy(baselineSuccessGeometry.equation, baselineSuccessGeometry.next, 12)) {
  throw new Error('baseline success equation and Next control do not have a 12px gutter');
}
if (baselineSuccessGeometry.banner && baselineSuccessGeometry.snacks.some((snack) => !separatedBy(baselineSuccessGeometry.banner, snack, 4))) {
  throw new Error('baseline success ribbon obscures a countable snack silhouette');
}

const guidedAudio = await debug(() => QLOBE_DEBUG.getAudioLog());
for (const key of ['guided-intro', 'how-many', 'count-together', guidedState.roundId + '-prompt', guidedState.roundId + '-success']) {
  if (!guidedAudio.some((event) => event.key === key && event.kind === 'clip')) {
    throw new Error(`recorded guided clip was not selected: ${key}`);
  }
}

// Complete all five guided rounds through the production next/win handlers.
for (let guard = 0; guard < 12; guard += 1) {
  const state = await debug(() => QLOBE_DEBUG.getState());
  if (state.screen === 'finale') break;
  if (state.phase === 'success') await debug(() => QLOBE_DEBUG.tap('next'));
  else await debug(() => QLOBE_DEBUG.winRound());
}
await waitState(() => QLOBE_DEBUG.getState().screen === 'finale');
await page.waitForTimeout(950);
await shot('07-guided-finale-1024x768');

// Counter mode exercises individual placement and every authored round.
await debug(async () => QLOBE_DEBUG.startMode('counter'));
await waitState(() => QLOBE_DEBUG.getState().phase === 'staging');
const beforeCounter = await debug(() => QLOBE_DEBUG.getState());
await debug(() => QLOBE_DEBUG.tap('add-snack:0'));
await page.waitForTimeout(80);
const afterCounter = await debug(() => QLOBE_DEBUG.getState());
if (afterCounter.placedSecond !== beforeCounter.placedSecond + 1) throw new Error('counter tap did not place exactly one snack');
await debug(() => QLOBE_DEBUG.winRound());
await waitState(() => QLOBE_DEBUG.getState().phase === 'success');
await page.waitForTimeout(850);
await shot('08-counter-success-1024x768');
for (let guard = 0; guard < 12; guard += 1) {
  const state = await debug(() => QLOBE_DEBUG.getState());
  if (state.screen === 'finale') break;
  if (state.phase === 'success') await debug(() => QLOBE_DEBUG.tap('next'));
  else await debug(() => QLOBE_DEBUG.winRound());
}
await waitState(() => QLOBE_DEBUG.getState().screen === 'finale');

// Free play: both addends, selection, removal, six-item cap, and celebration.
await debug(async () => QLOBE_DEBUG.startMode('picnic'));
await debug(async () => {
  await QLOBE_DEBUG.tap('picnic-left');
  await QLOBE_DEBUG.tap('food:blueberry');
  await QLOBE_DEBUG.tap('picnic-right');
});
let picnic = await debug(() => QLOBE_DEBUG.getState());
if (picnic.freeLeft.length !== 1 || picnic.freeRight.length !== 1 || picnic.total !== 2) {
  throw new Error(`free-play addends are wrong: ${JSON.stringify(picnic)}`);
}
await shot('09-my-picnic-1-plus-1-1024x768');
const picnicPromptAudit = await promptAudit();
if (!picnicPromptAudit?.fits) throw new Error(`picnic prompt escaped its raster plaque: ${JSON.stringify(picnicPromptAudit)}`);
await debug(() => QLOBE_DEBUG.tap('remove:left:0'));
picnic = await debug(() => QLOBE_DEBUG.getState());
if (picnic.total !== 1) throw new Error('free-play removal did not change the total');
await debug(async () => {
  while (QLOBE_DEBUG.getState().total < 6) await QLOBE_DEBUG.tap('picnic-left');
  await QLOBE_DEBUG.tap('picnic-right');
});
if ((await debug(() => QLOBE_DEBUG.getState())).total !== 6) throw new Error('free-play exceeded its six-snack clarity cap');
await debug(() => QLOBE_DEBUG.fastTimers(1));
await debug(() => { void QLOBE_DEBUG.tap('celebrate'); return true; });
await page.waitForTimeout(850);
await shot('10-my-picnic-celebration-1024x768');
await debug(() => QLOBE_DEBUG.fastTimers(0.035));

// Responsive and target-size matrix. Capture intentional compositions, not crops.
const viewports = [[768, 1024], [1180, 520], [844, 390]];
for (const [width, height] of viewports) {
  await page.setViewportSize({ width, height });
  await debug(async () => {
    QLOBE_DEBUG.fastTimers(0.035);
    await QLOBE_DEBUG.startMode('guided');
    await QLOBE_DEBUG.chooseTheme('berry');
    await QLOBE_DEBUG.winRound();
  });
  await waitState(() => QLOBE_DEBUG.getState().phase === 'success');
  await page.waitForTimeout(850);
  const successGeometry = await debug(() => {
    const rect = (selector) => {
      const box = document.querySelector(selector)?.getBoundingClientRect();
      return box ? { x: box.x, y: box.y, w: box.width, h: box.height } : null;
    };
    return { equation: rect('.equation-plaque'), next: rect('.next-action') };
  });
  if (!separatedBy(successGeometry.equation, successGeometry.next, 12)) {
    throw new Error(`success equation and Next collide at ${width}x${height}`);
  }
  const targets = await debug(() => QLOBE_DEBUG.getTargets());
  const effectiveTargets = await debug(() => [...document.querySelectorAll('[data-target]')].map((node) => {
    const rect = node.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return null;
    const before = getComputedStyle(node, '::before');
    const beforeWidth = Number.parseFloat(before.width) || 0;
    const beforeHeight = Number.parseFloat(before.height) || 0;
    return {
      id: String(node.dataset.target || node.id || ''),
      w: Math.max(rect.width, beforeWidth),
      h: Math.max(rect.height, beforeHeight),
    };
  }).filter(Boolean));
  const effectiveById = new Map(effectiveTargets.map((target) => [target.id, target]));
  for (const target of targets) {
    const effective = effectiveById.get(target.id) || { w: target.rect.w, h: target.rect.h };
    if (effective.w < 96 || effective.h < 96) {
      throw new Error(`undersized ${target.id} (${effective.w}x${effective.h}) at ${width}x${height}`);
    }
  }
  await shot(`11-success-${width}x${height}`);

  await debug(async () => {
    await QLOBE_DEBUG.startMode('picnic');
    await QLOBE_DEBUG.tap('picnic-left');
    await QLOBE_DEBUG.tap('picnic-right');
  });
  const picnicGeometry = await debug(() => {
    const rect = (node) => {
      const box = node.getBoundingClientRect();
      return { x: box.x, y: box.y, w: box.width, h: box.height };
    };
    const celebrate = document.querySelector('.celebrate-action');
    const foods = [...document.querySelectorAll('.palette-snack')];
    return {
      celebrate: celebrate ? rect(celebrate) : null,
      foods: foods.map(rect),
      visibleFoods: foods.filter((node) => {
        const box = node.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.top >= 0 && box.left >= 0
          && box.right <= innerWidth && box.bottom <= innerHeight;
      }).length,
    };
  });
  if (picnicGeometry.visibleFoods !== 6) throw new Error(`not all six picnic choices are visible at ${width}x${height}`);
  if (picnicGeometry.foods.some((food) => !separatedBy(food, picnicGeometry.celebrate, 0))) {
    throw new Error(`Celebrate obscures a picnic food choice at ${width}x${height}`);
  }
  await shot(`12-picnic-${width}x${height}`);
}

await page.setViewportSize({ width: 768, height: 1024 });
await debug(async () => {
  QLOBE_DEBUG.setReducedMotion(true);
  await QLOBE_DEBUG.startMode('counter');
  await QLOBE_DEBUG.winRound();
});
await waitState(() => QLOBE_DEBUG.getState().phase === 'success');
await shot('13-reduced-motion-success-768x1024');
if (await page.locator('.qk-confetti-layer').count()) throw new Error('reduced-motion success created confetti');

// Every visible runtime raster must decode and avoid obvious low-resolution stretch.
const imageReport = await debug(() => [...document.images].filter((image) => !image.closest('[hidden]')).map((image) => ({
  src: image.getAttribute('src'),
  complete: image.complete,
  naturalWidth: image.naturalWidth,
  renderedWidth: image.getBoundingClientRect().width,
})));
for (const image of imageReport) {
  if (!image.complete || image.naturalWidth < 1) throw new Error(`undecoded image: ${image.src}`);
  if (image.renderedWidth > image.naturalWidth * 1.35) throw new Error(`obvious raster upscale: ${image.src}`);
}

if (errors.length) throw new Error(`browser errors:\n${errors.join('\n')}`);
if (requestFailures.length) throw new Error(`request failures:\n${requestFailures.join('\n')}`);

console.log(JSON.stringify({
  url,
  modes,
  guidedRound: guidedState.roundId,
  screenshots: shots,
  visibleImages: imageReport.length,
  errors: errors.length,
  requestFailures: requestFailures.length,
}, null, 2));
await browser.close();
