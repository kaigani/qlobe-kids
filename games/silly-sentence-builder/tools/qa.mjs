#!/usr/bin/env node
import fs from 'node:fs/promises';
import {
  baseUrl,
  checkSessionClean,
  createReporter,
  debug,
  dragBetween,
  ensureShots,
  launchChrome,
  openSession,
  resolveShots,
  shooter,
} from '../../../tools/qa/lib/driver.mjs';

const explicitBaseIndex = process.argv.indexOf('--base-url');
const base = explicitBaseIndex >= 0 && process.argv[explicitBaseIndex + 1]
  ? process.argv[explicitBaseIndex + 1].replace(/\/$/, '')
  : baseUrl();
const shots = resolveShots('qa-shots/silly-sentence-builder');
const reporter = createReporter({ detailOnFail: true, detailLimit: 14000 });
const { check, finish, note } = reporter;
const shot = shooter(shots);
const sessions = [];
const evidence = [];
const analytics = ['https://www.googletagmanager.com/', 'https://www.google-analytics.com/'];

const scenarios = [
  { modeId: 'silly', viewport: { width: 1024, height: 768 }, label: 'tablet-landscape', detail: true },
  { modeId: 'sillier', viewport: { width: 1280, height: 800 }, label: 'wide-landscape', detail: true },
  { modeId: 'silly', viewport: { width: 768, height: 1024 }, label: 'portrait', detail: false },
  { modeId: 'sillier', viewport: { width: 1180, height: 520 }, label: 'short-landscape', detail: false },
  { modeId: 'sillier', viewport: { width: 768, height: 1024 }, label: 'portrait-reduced', reducedMotion: 'reduce', detail: false },
];

async function waitForVisualReady(page) {
  await page.waitForFunction(() => [...document.images]
    .filter((image) => image.getClientRects().length)
    .every((image) => image.complete && image.naturalWidth > 0));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function auditContentContract() {
  const game = new URL('../', import.meta.url);
  const [config, lines, manifest, html, css, main] = await Promise.all([
    fs.readFile(new URL('config.json', game), 'utf8').then(JSON.parse),
    fs.readFile(new URL('assets/audio/lines.json', game), 'utf8').then(JSON.parse),
    fs.readFile(new URL('assets/audio/manifest.json', game), 'utf8').then(JSON.parse),
    fs.readFile(new URL('index.html', game), 'utf8'),
    fs.readFile(new URL('css/style.css', game), 'utf8'),
    fs.readFile(new URL('js/main.js', game), 'utf8'),
  ]);

  const categoryIds = Object.keys(config.categories);
  const choiceIds = Object.fromEntries(categoryIds.map((part) => [
    part,
    config.choices[part].map((choice) => choice.id),
  ]));
  const requiredVoice = new Set([
    ...Object.keys(config.voice),
    ...Object.values(config.choices).flat().map((choice) => choice.voiceKey),
  ]);

  check('content has exactly two single-skill modes', config.modes.length === 2 && new Set(config.modes.map((mode) => mode.id)).size === 2);
  check('content has a three-show session', config.roundsPerSession === 3);
  check('each category has six unique picture choices', categoryIds.length === 4 && categoryIds.every((part) => (
    choiceIds[part].length === 6 && new Set(choiceIds[part]).size === 6
  )), JSON.stringify(choiceIds));
  check('mode parts resolve to canonical categories', config.modes.every((mode) => mode.parts.every((part) => categoryIds.includes(part))));
  check('written voice source covers every line and selectable phrase', [...requiredVoice].every((key) => typeof lines[key] === 'string' && lines[key].length > 0), JSON.stringify([...requiredVoice].filter((key) => !lines[key])));
  check('recorded voice manifest covers the exact approved script', Object.keys(manifest).length === requiredVoice.size && [...requiredVoice].every((key) => manifest[key]?.file && manifest[key]?.dur > 0), JSON.stringify({ required: requiredVoice.size, actual: Object.keys(manifest).length }));

  const missing = [];
  const artUrls = new Set([
    './assets/backgrounds/theater.webp',
    './assets/ui/title.webp',
    './assets/ui/action-button.webp',
    './assets/ui/label-plaque.webp',
    './assets/ui/progress-star.webp',
    './assets/ui/sentence-strip.webp',
    ...Object.values(config.categories).flatMap((category) => [category.tray, category.card]),
    ...Object.values(config.choices).flat().map((choice) => choice.art),
    ...Object.values(manifest).map((entry) => `./assets/audio/${entry.file}`),
  ]);
  for (const relative of artUrls) {
    try { await fs.access(new URL(relative, game)); } catch { missing.push(relative); }
  }
  check('all canonical raster and recorded audio assets exist', missing.length === 0, JSON.stringify(missing));

  const runtimeSource = `${html}\n${css}\n${main}`;
  check('runtime contains no SVG, vector data URI, emoji, or CSS gradient artwork', !/(?:\.svg\b|data:image\/svg|gradient\s*\(|[\u{1F300}-\u{1FAFF}])/u.test(runtimeSource));
  check('runtime has no model, LAN API, or authoring request path', !/(?:localhost:\d+\/(?:api|v1)|192\.168\.|text-to-image|qwen|krea|minimax)/i.test(runtimeSource));
  check('runtime uses the hardened shared drag controller', main.includes("stage/drag-to-slot-dom.js") && main.includes('createDragToSlotDom'));
}

async function open(browser, scenario, options = {}) {
  const session = await openSession(browser, {
    url: `${base}/games/silly-sentence-builder/`,
    base,
    viewport: scenario.viewport,
    seed: 42,
    fastTimers: 0.04,
    mute: options.mute ?? true,
    reducedMotion: scenario.reducedMotion || 'no-preference',
    allowAbortedMedia: true,
    allowRemote: analytics,
  });
  sessions.push(session);
  return session;
}

async function auditTargets(page, label) {
  const result = await page.evaluate(() => {
    const targets = [...document.querySelectorAll('[data-target]')]
      .filter((node) => node.getClientRects().length && getComputedStyle(node).visibility !== 'hidden' && !node.disabled)
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.dataset.target,
          role: node.dataset.role || 'neutral',
          x: rect.x,
          y: rect.y,
          w: rect.width,
          h: rect.height,
          right: rect.right,
          bottom: rect.bottom,
        };
      });
    const overlaps = [];
    for (let left = 0; left < targets.length; left += 1) {
      for (let right = left + 1; right < targets.length; right += 1) {
        const a = targets[left];
        const b = targets[right];
        const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x));
        const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y));
        const intersection = width * height;
        const smaller = Math.min(a.w * a.h, b.w * b.h);
        if (smaller > 0 && intersection / smaller > 0.08) {
          overlaps.push({ a: a.id, b: b.id, ratio: Math.round((intersection / smaller) * 1000) / 1000 });
        }
      }
    }
    return {
      targets,
      overlaps,
      viewport: { width: innerWidth, height: innerHeight },
      duplicateIds: [...new Set(targets.map((target) => target.id).filter((id, index, all) => all.indexOf(id) !== index))],
    };
  });
  const { width, height } = result.viewport;
  check(`${label}: visible targets are at least 96px`, result.targets.every((target) => target.w >= 95.5 && target.h >= 95.5), JSON.stringify(result.targets));
  check(`${label}: visible targets stay inside the viewport`, result.targets.every((target) => (
    target.x >= -0.5 && target.y >= -0.5 && target.right <= width + 0.5 && target.bottom <= height + 0.5
  )), JSON.stringify(result.targets));
  check(`${label}: visible targets do not materially overlap`, result.overlaps.length === 0, JSON.stringify(result.overlaps));
  check(`${label}: target ids are unique`, result.duplicateIds.length === 0, JSON.stringify(result.duplicateIds));
  return result;
}

async function pickForActivePart(page, { avoid = null, index = 0 } = {}) {
  const state = await debug.getState(page);
  const prefix = `choice:${state.activePart}:`;
  const targets = (await debug.getTargets(page)).filter((target) => target.id.startsWith(prefix));
  const target = targets.find((entry) => entry.id !== `${prefix}${avoid}`) || targets[index % targets.length];
  if (!target) throw new Error(`No choice target for active part ${state.activePart}`);
  await debug.tap(page, target.id);
  return target.id.slice(prefix.length);
}

async function fillSentence(page, { captureFirst = null } = {}) {
  let steps = 0;
  while (steps < 5) {
    const state = await debug.getState(page);
    if (state.phase === 'ready') return state;
    if (state.screen !== 'build' || state.phase !== 'choosing') throw new Error(`Unexpected build state ${JSON.stringify(state)}`);
    await pickForActivePart(page);
    steps += 1;
    if (steps === 1 && captureFirst) {
      await waitForVisualReady(page);
      await captureFirst();
    }
  }
  throw new Error('Sentence did not reach ready state');
}

async function swapWho(page, label) {
  const before = await debug.getState(page);
  await debug.tap(page, 'slot:who');
  const opened = await debug.getState(page);
  check(`${label}: a filled slot reopens its category`, opened.phase === 'choosing' && opened.activePart === 'who', JSON.stringify(opened));
  await pickForActivePart(page, { avoid: before.selections.who });
  const after = await debug.getState(page);
  check(`${label}: swapping routes through the shared selection handler`, after.phase === 'ready' && after.selections.who !== before.selections.who, JSON.stringify({ before, after }));
  check(`${label}: swapping preserves the other sentence parts`, Object.keys(before.selections).filter((part) => part !== 'who').every((part) => before.selections[part] === after.selections[part]), JSON.stringify({ before: before.selections, after: after.selections }));
  return after;
}

async function editFromReveal(page, label) {
  const before = await debug.getState(page);
  await debug.tap(page, 'edit');
  await debug.waitForScreen(page, 'build');
  const opened = await debug.getState(page);
  check(`${label}: reveal edit returns to the same live sentence`, opened.roundIndex === before.roundIndex && opened.phase === 'choosing' && opened.completed.length === before.completed.length - 1, JSON.stringify({ before, opened }));
  await pickForActivePart(page, { avoid: before.selections[opened.activePart] });
  const ready = await debug.getState(page);
  check(`${label}: edited sentence returns to ready without losing filled parts`, ready.phase === 'ready' && Object.values(ready.selections).filter(Boolean).length === currentPartCount(ready.modeId), JSON.stringify(ready));
  await debug.tap(page, 'show');
  await debug.waitForScreen(page, 'reveal');
}

function currentPartCount(modeId) {
  return modeId === 'sillier' ? 4 : 3;
}

async function driveSession(browser, scenario) {
  const session = await open(browser, scenario);
  const { page } = session;
  const label = `${scenario.label}-${scenario.modeId}`;
  const capturePrefix = `${scenario.label}-${scenario.modeId}`;

  const splashTargets = await auditTargets(page, `${label} splash`);
  if (scenario.detail || scenario.label.includes('portrait') || scenario.label === 'short-landscape') {
    await shot(page, `${capturePrefix}-01-splash`);
  }
  await debug.startMode(page, scenario.modeId);
  await debug.waitForScreen(page, 'build');
  let state = await debug.getState(page);
  check(`${label}: requested mode starts an empty reversible round`, state.modeId === scenario.modeId && state.roundIndex === 0 && state.phase === 'choosing' && Object.values(state.selections).every((value) => value === null), JSON.stringify(state));
  const plan = await debug.call(page, 'getRoundPlan');
  check(`${label}: seeded round plan includes six unique choices per part`, plan.parts.every((part) => plan.choiceOrders[part].length === 6 && new Set(plan.choiceOrders[part]).size === 6), JSON.stringify(plan));
  const buildTargets = await auditTargets(page, `${label} initial build`);

  const completedSentences = [];
  for (let round = 0; round < 3; round += 1) {
    state = await debug.getState(page);
    check(`${label}: round ${round + 1} begins in build`, state.screen === 'build' && state.roundIndex === round && state.phase === 'choosing', JSON.stringify(state));
    await fillSentence(page, {
      captureFirst: round === 0 ? async () => {
        await auditTargets(page, `${label} mid-build`);
        await shot(page, `${capturePrefix}-02-mid-build`);
      } : null,
    });
    if (round === 0) await swapWho(page, label);
    state = await debug.getState(page);
    check(`${label}: round ${round + 1} forms a complete sentence`, state.phase === 'ready' && state.sentence.endsWith('.') && Object.values(state.selections).filter(Boolean).length === currentPartCount(scenario.modeId), JSON.stringify(state));
    await auditTargets(page, `${label} ready`);
    if (round === 0) {
      await waitForVisualReady(page);
      await shot(page, `${capturePrefix}-03-ready`);
    }

    await debug.tap(page, 'show');
    await debug.waitForScreen(page, 'reveal');
    await debug.call(page, 'showReveal');
    await waitForVisualReady(page);
    state = await debug.getState(page);
    check(`${label}: reveal preserves the exact assembled sentence`, state.phase === 'reveal' && state.completed.at(-1)?.text === state.sentence, JSON.stringify(state));
    await auditTargets(page, `${label} reveal`);
    if (round === 0) {
      await shot(page, `${capturePrefix}-04-reveal-peak`);
      await editFromReveal(page, label);
      await debug.call(page, 'showReveal');
      await waitForVisualReady(page);
      state = await debug.getState(page);
    }
    completedSentences.push(state.sentence);
    await debug.tap(page, 'another');
    if (round < 2) await debug.waitForScreen(page, 'build');
  }

  await debug.waitForScreen(page, 'end');
  state = await debug.getState(page);
  check(`${label}: three reveals produce a three-panel quilt`, state.completed.length === 3 && await page.locator('.quilt-card').count() === 3, JSON.stringify(state));
  check(`${label}: consecutive deterministic sentences do not immediately repeat`, completedSentences.every((sentence, index) => index === 0 || sentence !== completedSentences[index - 1]), JSON.stringify(completedSentences));
  const endTargets = await auditTargets(page, `${label} end`);
  await waitForVisualReady(page);
  await shot(page, `${capturePrefix}-05-quilt`);
  await debug.call(page, 'home');
  await debug.waitForScreen(page, 'splash');
  check(`${label}: Back/Home debug route returns to in-page splash`, (await debug.getState(page)).screen === 'splash');

  const record = {
    label,
    scenario,
    plan,
    completedSentences,
    finalState: state,
    splashTargets,
    buildTargets,
    endTargets,
    consoleErrors: session.errors,
    failedResponses: session.failed,
    remoteRequests: session.remote,
  };
  evidence.push(record);
  return record;
}

async function checkPhysicalInput(browser) {
  const scenario = { viewport: { width: 1280, height: 800 } };
  const session = await open(browser, scenario);
  const { page } = session;

  const mode = page.locator('[data-target="mode:silly"]');
  await mode.focus();
  await page.keyboard.press('Enter');
  await debug.waitForScreen(page, 'build');
  check('keyboard activation starts a mode through its real control', (await debug.getState(page)).modeId === 'silly');

  const before = await debug.getState(page);
  const choice = page.locator(`[data-target^="choice:${before.activePart}:"]`).first();
  const slot = page.locator(`[data-slot="${before.activePart}"]`);
  const choiceBox = await choice.boundingBox();
  const slotBox = await slot.boundingBox();
  check('physical-input probe exposes a real picture and category slot', Boolean(choiceBox && slotBox), JSON.stringify({ choiceBox, slotBox }));
  if (choiceBox && slotBox) {
    await dragBetween(page, choiceBox, slotBox, { steps: 14 });
    await page.waitForFunction((part) => Boolean(window.QLOBE_DEBUG.getState().selections[part]), before.activePart);
    const after = await debug.getState(page);
    check('real pointer drag advances through the shared selection state', Boolean(after.selections[before.activePart]) && after.activePart !== before.activePart, JSON.stringify(after));
    check('completed drag leaves no stranded ghost', await page.locator('[data-qk-drag-ghost], .choice-card.dragging').count() === 0);
  }

  await page.locator('[data-target="back"]').click();
  await debug.waitForScreen(page, 'splash');
  check('real Back control returns to the playhouse splash', (await debug.getState(page)).screen === 'splash');
  evidence.push({ label: 'physical-keyboard-drag', state: await debug.getState(page), consoleErrors: session.errors, failedResponses: session.failed, remoteRequests: session.remote });
}

async function checkRecordedVoice(browser) {
  const scenario = { viewport: { width: 1280, height: 800 } };
  const session = await open(browser, scenario, { mute: false });
  const { page } = session;
  await debug.clearAudioLog(page);
  await page.locator('[data-target="mode:silly"]').click();
  await debug.waitForScreen(page, 'build');
  await debug.waitForAudio(page, 'welcome', { timeout: 8000 });
  const state = await debug.getState(page);
  const choiceTarget = (await debug.getTargets(page)).find((target) => target.id.startsWith(`choice:${state.activePart}:`));
  await debug.tap(page, choiceTarget.id);
  const selected = await debug.getState(page);
  const whoKey = `who-${selected.selections.who}`;
  await debug.waitForAudio(page, whoKey, { timeout: 8000 });
  const log = await debug.getAudioLog(page);
  check('recorded teacher welcome plays only after a real mode gesture', log.some((entry) => entry.key === 'welcome' && entry.kind === 'clip'), JSON.stringify(log));
  check('selected picture speaks with a recorded teacher clip', log.some((entry) => entry.key === whoKey && entry.kind === 'clip'), JSON.stringify(log));
  evidence.push({ label: 'recorded-voice', audioLog: log, consoleErrors: session.errors, failedResponses: session.failed, remoteRequests: session.remote });
}

async function main() {
  await ensureShots(shots);
  await auditContentContract();
  const browser = await launchChrome({ channel: 'chrome' });
  try {
    for (const scenario of scenarios) await driveSession(browser, scenario);
    await checkPhysicalInput(browser);
    await checkRecordedVoice(browser);
  } finally {
    for (const [index, session] of sessions.entries()) {
      const cleanSession = {
        ...session,
        failed: session.failed.filter((entry) => !analytics.some((prefix) => entry.includes(prefix))),
      };
      checkSessionClean(reporter, cleanSession, `browser session ${index + 1}`);
    }
    await browser.close();
  }
  const report = {
    gameId: 'silly-sentence-builder',
    base,
    createdAt: new Date().toISOString(),
    evidence,
    checks: reporter.results,
  };
  await fs.writeFile(`${shots}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  note(`visual evidence: ${shots}`);
  await finish({ suffix: `; shots in ${shots}` });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
