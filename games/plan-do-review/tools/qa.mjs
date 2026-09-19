#!/usr/bin/env node
// Real-Chrome smoke, responsive-layout, interaction, and visual-QC gate.

import { access, readFile, readdir, stat } from "node:fs/promises";
import { constants as FS } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  baseUrl,
  launchChrome,
  createReporter,
  openSession,
  checkSessionClean,
  resolveShots,
  ensureShots,
  shooter,
  debug,
  dragBetween,
  targetSizes,
  undersized,
} from "../../../tools/qa/lib/driver.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GAME = path.resolve(HERE, "..");
const ROOT = path.resolve(GAME, "..", "..");
const BASE = baseUrl("http://127.0.0.1:8000");
const SHOTS = resolveShots(path.resolve(ROOT, "..", "qa-shots", "plan-do-review"));
const shot = shooter(SHOTS);
const reporter = createReporter({ style: "ok", collapse: true, detailLimit: 260 });
const { check, note, finish } = reporter;
const PLATFORM_ANALYTICS = [
  "https://www.googletagmanager.com/",
  "https://www.google-analytics.com/",
];

const LINE_KEYS = [
  "intro", "plan-prompt", "plan-tower", "plan-garden", "plan-picnic",
  "do-prompt", "do-nudge", "do-complete", "feeling-prompt",
  "feeling-happy", "feeling-proud", "feeling-challenged", "feeling-calm",
  "skill-prompt", "skill-patience", "skill-problem-solving",
  "skill-creativity", "reward", "again",
];

const readJson = async (file) => JSON.parse(await readFile(file, "utf8"));
const exists = async (file) => {
  try {
    await access(file, FS.F_OK);
    return true;
  } catch {
    return false;
  }
};

async function staticChecks() {
  const config = await readJson(path.join(GAME, "config.json"));
  const manifest = await readJson(path.join(GAME, "game.json"));
  const lines = await readJson(path.join(GAME, "data", "lines.json"));
  const audio = await readJson(path.join(GAME, "assets", "audio", "manifest.json"));
  const voiceAttempt = await readJson(path.join(GAME, "assets", "source", "voice", "generation-attempt.json"));
  const receipt = await readJson(path.join(GAME, "assets", "source", "production-receipt.json"));
  const html = await readFile(path.join(GAME, "index.html"), "utf8");

  check("manifest identifies the replacement game", manifest.id === "plan-do-review" && manifest.title === "My Awesome Day" && manifest.status === "beta");
  check("one fixed Plan-Do-Review mode ships", config.mode.id === "awesome-day" && manifest.modes.length === 1);
  check("three authored plans each have four unique pieces", config.activities.length === 3 && config.activities.every((activity) => activity.pieces.length === 4 && new Set(activity.pieces.map((piece) => piece.id)).size === 4));
  check("reflection has four feelings and three learning powers", config.feelings.length === 4 && config.skills.length === 3);
  check("all 19 exact spoken lines are present", LINE_KEYS.every((key) => lines[key] && (typeof lines[key] === "string" || lines[key].text)) && Object.keys(lines).length === LINE_KEYS.length);
  check("the platform analytics tag is linked exactly once", (html.match(/\.\.\/\.\.\/shared\/js\/analytics\.js/g) || []).length === 1);

  const refs = [
    ...Object.values(config.backgrounds),
    ...Object.values(config.characters),
    ...Object.values(config.ui),
    ...config.activities.flatMap((activity) => [activity.preview, ...activity.pieces.map((piece) => piece.art)]),
    ...config.feelings.map((item) => item.art),
    ...config.skills.map((item) => item.art),
    config.music.src,
  ];
  const missing = [];
  for (const ref of refs) {
    const file = path.resolve(GAME, ref);
    if (!(await exists(file))) missing.push(ref);
  }
  check("every configured runtime asset resolves", missing.length === 0, missing.join(", "));
  check("production receipt covers all 47 raster outputs", receipt.assets?.length === 47, String(receipt.assets?.length));

  const backgroundProblems = [];
  for (const name of ["plan-room.webp", "do-room.webp", "review-room.webp"]) {
    const bytes = (await stat(path.join(GAME, "assets", "backgrounds", name))).size;
    if (bytes > 310 * 1024) backgroundProblems.push(`${name} ${(bytes / 1024).toFixed(1)}KB`);
  }
  check("room plates stay inside the 310 KB web budget", backgroundProblems.length === 0, backgroundProblems.join(", "));
  check("hub tile is a 640x533 optimized JPEG under 180 KB", await (async () => {
    const file = path.join(ROOT, "assets", "hub", "tiles", "plan-do-review.jpg");
    return (await exists(file)) && (await stat(file)).size < 180 * 1024;
  })());

  const cutterCounts = [
    ["ui-carriers", 12], ["reflection-patches", 7], ["hud-controls", 5],
    ["tower-pieces", 5], ["garden-pieces", 5], ["picnic-pieces", 5],
  ];
  const cutterProblems = [];
  for (const [folder, expected] of cutterCounts) {
    const boxes = await readJson(path.join(GAME, "assets", "source", "cuts", folder, "boxes.json"));
    if (boxes.assets?.length !== expected) cutterProblems.push(`${folder}:${boxes.assets?.length}/${expected}`);
  }
  check("asset cutter exact-count gates all passed", cutterProblems.length === 0, cutterProblems.join(", "));

  const sources = ["index.html", "css/style.css", "js/main.js", "config.js", "config.json"];
  const forbidden = [];
  for (const relative of sources) {
    const text = await readFile(path.join(GAME, relative), "utf8");
    if (/<svg|data:image\/svg|linear-gradient|radial-gradient/i.test(text)) forbidden.push(relative);
  }
  check("shipped UI contains no SVG or CSS-gradient artwork", forbidden.length === 0, forbidden.join(", "));

  const badAudio = [];
  for (const [key, entry] of Object.entries(audio)) {
    if (!LINE_KEYS.includes(key) || !entry.file || !(await exists(path.join(GAME, "assets", "audio", entry.file)))) badAudio.push(key);
  }
  check("every shipped voice entry resolves (Web Speech covers rejected LAN takes)", badAudio.length === 0, badAudio.join(", "));
  const clipCount = Object.keys(audio).length;
  const documentedFallback = clipCount === 0
    && voiceAttempt.requested === LINE_KEYS.length
    && voiceAttempt.accepted === 0
    && LINE_KEYS.every((key) => voiceAttempt.failedKeys?.includes(key));
  check("narration release policy has either a complete clip set or a complete rejected-take receipt", clipCount === LINE_KEYS.length || documentedFallback, JSON.stringify({ clipCount, requested: voiceAttempt.requested, accepted: voiceAttempt.accepted }));
  note(`${Object.keys(audio).length}/19 cloned clips shipped; absent clips intentionally use voice-clips.js Web Speech fallback.`);
}

function checkGameSessionClean(session, label) {
  const failed = session.failed.filter((entry) => !PLATFORM_ANALYTICS.some((prefix) => entry.startsWith(prefix)));
  checkSessionClean(reporter, { ...session, failed }, label);
}

async function layoutSnapshot(page) {
  return page.evaluate(() => ({
    viewport: [innerWidth, innerHeight],
    scroll: [document.documentElement.scrollWidth, document.documentElement.scrollHeight],
    bodyOverflow: getComputedStyle(document.body).overflow,
  }));
}

async function checkTargets(page, label, minimum) {
  const sizes = await targetSizes(page);
  const bad = undersized(sizes, minimum);
  check(`${label} targets meet the ${minimum}px floor`, bad.length === 0, JSON.stringify(bad));
}

async function driveLandscape(browser) {
  const session = await openSession(browser, {
    url: `${BASE}/games/plan-do-review/`,
    base: BASE,
    viewport: { width: 1180, height: 820 },
    reducedMotion: "no-preference",
    seed: 42,
    fastTimers: 0.05,
    mute: true,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  const { page } = session;

  check("landscape boots to splash", (await debug.getState(page)).screen === "splash");
  check("debug exposes the awesome-day mode", (await debug.listModes(page)).map((mode) => mode.id).join() === "awesome-day");
  const mutedIcon = await page.locator('[data-target="sound"] img').getAttribute("src");
  await debug.mute(page, false);
  const audibleIcon = await page.locator('[data-target="sound"] img').getAttribute("src");
  await debug.mute(page, true);
  check("debug muting keeps the visible sound control in sync", mutedIcon !== audibleIcon && (await page.locator('[data-target="sound"]').getAttribute("aria-pressed")) === "true");
  await checkTargets(page, "landscape splash", 96);
  await shot(page, "01-splash-landscape");

  await debug.startMode(page, "awesome-day");
  await debug.waitForScreen(page, "plan");
  check("mode enters PLAN", (await debug.getState(page)).screen === "plan");
  await checkTargets(page, "landscape plan", 96);
  await shot(page, "02-plan-landscape");

  await debug.clearAudioLog(page);
  check("tower plan can be selected through the semantic action", await debug.call(page, "selectPlan", "tower"));
  check("PLAN remembers the chosen intention", (await debug.getState(page)).activity === "tower");
  const planAudio = await debug.getAudioLog(page);
  check("the rejected-clip manifest uses the documented Web Speech delivery", planAudio.some((entry) => entry.key === "plan-tower" && entry.kind === "speech"), JSON.stringify(planAudio));
  await shot(page, "03-plan-selected-landscape");
  await debug.tap(page, "start");
  await debug.waitForScreen(page, "do");
  await checkTargets(page, "landscape DO", 88);
  await shot(page, "04-do-empty-landscape");

  const from = await page.locator('[data-piece="tower-base"]').boundingBox();
  const to = await page.locator('[data-slot="tower-base"]').boundingBox();
  await dragBetween(page, from, to, {
    steps: 12,
    hold: async ({ end }) => {
      await page.mouse.move(end.x, end.y, { steps: 8 });
      await page.waitForTimeout(120);
      const activeSlot = await page.locator(".is-drop-active").getAttribute("data-slot");
      check("live drag elevates and glows the matching overlapping silhouette", activeSlot === "tower-base", String(activeSlot));
      await shot(page, "04b-do-drag-active-landscape");
    },
  });
  await page.waitForTimeout(800);
  const afterDrag = await debug.getState(page);
  const dragPassed = check("real pointer drag places the matching felt piece", afterDrag.placedPieceIds.includes("tower-base"), JSON.stringify({ stage: afterDrag.dragStage, placed: afterDrag.placedPieceIds }));
  if (!dragPassed) await debug.call(page, "placePiece", "tower-base");

  await debug.call(page, "placePiece", "tower-block");
  await debug.call(page, "placePiece", "tower-arch");
  check("tap-compatible semantic placement reaches 3/4", (await debug.getState(page)).placedPieceIds.length === 3);
  await shot(page, "05-do-three-placed-landscape");
  await debug.call(page, "placePiece", "tower-roof");
  await debug.waitForScreen(page, "feeling", { timeout: 10000 });
  check("DO completion advances to feeling review", (await debug.getState(page)).screen === "feeling");
  await shot(page, "06-review-feeling-landscape");

  await debug.call(page, "selectFeeling", "challenged");
  await debug.waitForScreen(page, "learning", { timeout: 10000 });
  check("a non-happy feeling is accepted without penalty", (await debug.getState(page)).feeling === "challenged");
  await shot(page, "07-review-learning-landscape");

  await debug.call(page, "selectSkill", "problem-solving");
  await debug.waitForScreen(page, "reward", { timeout: 10000 });
  const reward = await debug.getState(page);
  check("learning choice reaches reward", reward.skill === "problem-solving" && reward.screen === "reward");
  check("reward saves one bounded star", reward.stars >= 1 && reward.stars <= 5);
  const rewardMotion = await page.locator(".jar-star.is-arriving").evaluate((node) => ({
    name: getComputedStyle(node).animationName,
    duration: getComputedStyle(node).animationDuration,
  }));
  check("the earned star has a live arrival animation", rewardMotion.name.includes("star-arrive") && parseFloat(rewardMotion.duration) > 0.01, JSON.stringify(rewardMotion));
  await checkTargets(page, "landscape reward", 88);
  await shot(page, "08-reward-landscape");

  const variations = {
    garden: ["garden-pot", "garden-stem", "garden-flower", "garden-sun"],
    picnic: ["picnic-basket", "picnic-apple", "picnic-sandwich", "picnic-drink"],
  };
  for (const [activityId, pieces] of Object.entries(variations)) {
    await debug.call(page, "home");
    await debug.startMode(page, "awesome-day");
    await debug.call(page, "selectPlan", activityId);
    await debug.tap(page, "start");
    await debug.waitForScreen(page, "do");
    if (activityId === "garden") {
      await debug.tap(page, "piece-garden-pot");
      await debug.tap(page, "slot-garden-sun");
      await page.waitForTimeout(80);
      check("a near miss never removes or invents progress", (await debug.getState(page)).placedPieceIds.length === 0);
    }
    for (const piece of pieces) await debug.call(page, "placePiece", piece);
    await debug.waitForScreen(page, "feeling", { timeout: 10000 });
    await debug.call(page, "selectFeeling", "proud");
    await debug.waitForScreen(page, "learning", { timeout: 10000 });
    await debug.call(page, "selectSkill", "creativity");
    await debug.waitForScreen(page, "reward", { timeout: 10000 });
    check(`${activityId} variation completes its whole ritual`, (await debug.getState(page)).activity === activityId);
  }

  const layout = await layoutSnapshot(page);
  check("landscape has no document overflow", layout.scroll[0] <= layout.viewport[0] && layout.scroll[1] <= layout.viewport[1], JSON.stringify(layout));
  checkGameSessionClean(session, "landscape");
  await session.close();
}

async function driveResponsive(browser, label, viewport, reducedMotion, minimum) {
  const session = await openSession(browser, {
    url: `${BASE}/games/plan-do-review/`,
    base: BASE,
    viewport,
    reducedMotion,
    seed: 42,
    fastTimers: 0.05,
    mute: true,
    allowAbortedMedia: true,
    allowRemote: PLATFORM_ANALYTICS,
  });
  const { page } = session;
  check(`${label} boots`, (await debug.getState(page)).screen === "splash");
  if (reducedMotion === "reduce") check(`${label} reports reduced motion`, (await debug.getState(page)).reducedMotion === true);
  await shot(page, `09-${label}-splash`);
  await debug.startMode(page, "awesome-day");
  await debug.call(page, "selectPlan", "garden");
  await debug.tap(page, "start");
  await debug.waitForScreen(page, "do");
  await checkTargets(page, `${label} DO`, minimum);
  await shot(page, `10-${label}-do`);
  if (reducedMotion === "reduce") {
    for (const piece of ["garden-pot", "garden-stem", "garden-flower", "garden-sun"]) {
      await debug.call(page, "placePiece", piece);
    }
    await debug.waitForScreen(page, "feeling", { timeout: 10000 });
    await debug.call(page, "selectFeeling", "calm");
    await debug.waitForScreen(page, "learning", { timeout: 10000 });
    await debug.call(page, "selectSkill", "patience");
    await debug.waitForScreen(page, "reward", { timeout: 10000 });
    const reducedRewardMotion = await page.locator(".jar-star.is-arriving").evaluate((node) => ({
      name: getComputedStyle(node).animationName,
      duration: getComputedStyle(node).animationDuration,
    }));
    check(`${label} collapses the reward arrival animation`, reducedRewardMotion.name.includes("star-arrive") && parseFloat(reducedRewardMotion.duration) <= 0.001, JSON.stringify(reducedRewardMotion));
    await shot(page, "11-portrait-reduced-reward");
  }
  const layout = await layoutSnapshot(page);
  check(`${label} has no document overflow`, layout.scroll[0] <= layout.viewport[0] && layout.scroll[1] <= layout.viewport[1], JSON.stringify(layout));
  checkGameSessionClean(session, label);
  await session.close();
}

async function main() {
  await ensureShots(SHOTS);
  await staticChecks();
  const browser = await launchChrome();
  try {
    await driveLandscape(browser);
    await driveResponsive(browser, "portrait", { width: 768, height: 1024 }, "no-preference", 88);
    await driveResponsive(browser, "short-landscape", { width: 844, height: 390 }, "no-preference", 56);
    await driveResponsive(browser, "portrait-reduced", { width: 390, height: 844 }, "reduce", 56);
  } finally {
    await browser.close();
    const files = (await readdir(SHOTS)).filter((file) => file.endsWith(".png"));
    finish({ suffix: `; ${files.length} screenshots in ${SHOTS}` });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
