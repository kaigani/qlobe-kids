#!/usr/bin/env node
import path from "node:path";
import {
  args,
  checkSessionClean,
  createReporter,
  debug,
  dragBetween,
  ensureShots,
  launchChrome,
  openSession,
  resolveShots,
  shooter,
} from "../../../tools/qa/lib/driver.mjs";

const base = (args.flag("base") || "http://127.0.0.1:8000").replace(/\/$/, "");
const url = `${base}/games/community-helper-cards/`;
const shots = resolveShots(
  path.resolve("../qa-shots/community-helper-cards-latest"),
);
const report = createReporter({
  style: "ok",
  collapse: true,
  detailLimit: 300,
});

await ensureShots(shots);
const browser = await launchChrome({
  args: ["--autoplay-policy=no-user-gesture-required"],
});
const shot = shooter(shots);

async function imageStatus(page) {
  return page.evaluate(async () => {
    const active = document.querySelector("[data-qk-screen]:not([hidden])");
    const images = [...(active?.querySelectorAll("img") || [])];
    await Promise.all(
      images.map(async (image) => {
        if (!image.complete) {
          await new Promise((resolve) => {
            image.addEventListener("load", resolve, { once: true });
            image.addEventListener("error", resolve, { once: true });
          });
        }
        try {
          await image.decode?.();
        } catch {
          /* reported through naturalWidth */
        }
      }),
    );
    return images
      .filter((image) => !image.complete || image.naturalWidth <= 0)
      .map((image) => image.currentSrc || image.src || image.alt);
  });
}

async function clippedTargets(page) {
  return page.evaluate(() => {
    const active = document.querySelector("[data-qk-screen]:not([hidden])");
    return [...(active?.querySelectorAll("[data-target]") || [])]
      .map((node) => {
        const rect = node.getBoundingClientRect();
        return {
          id: node.dataset.target,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          clipped:
            rect.width > 0 &&
            rect.height > 0 &&
            (rect.left < 0 ||
              rect.top < 0 ||
              rect.right > window.innerWidth ||
              rect.bottom > window.innerHeight),
        };
      })
      .filter((item) => item.clipped);
  });
}

async function capture(page, name, requireFit = false) {
  const broken = await imageStatus(page);
  report.check(
    `${name} has no broken raster assets`,
    broken.length === 0,
    broken.join(", "),
  );
  if (requireFit) {
    const clipped = await clippedTargets(page);
    report.check(
      `${name} keeps every active action in view`,
      clipped.length === 0,
      JSON.stringify(clipped),
    );
  }
  await shot(page, name);
}

async function toolOrder(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll(".chc-tool")].map(
      (node) => node.dataset.tool,
    ),
  );
}

async function currentTargets(page) {
  const targets = await debug.getTargets(page);
  return {
    wrong: targets.find((target) => target.role === "wrong"),
    right: targets.find((target) => target.role === "correct"),
    slot: targets.find((target) => target.id === "drop-slot"),
  };
}

async function completeHelper(page, id) {
  await debug.startMode(page, id);
  await debug.winRound(page);
  await page.waitForFunction(() => window.QLOBE_DEBUG.getState().round === 1);
  await debug.winRound(page);
  await debug.waitForScreen(page, "reward");
}

async function seedGate(page) {
  const orders = [];
  for (const value of [4242, 4242, 7, 19, 71]) {
    await debug.seed(page, value);
    await debug.startMode(page, "firefighter");
    orders.push((await toolOrder(page)).join(","));
    await debug.call(page, "home");
  }
  report.check(
    "the same debug seed repeats the same tool order",
    orders[0] === orders[1],
    orders.join(" | "),
  );
  report.check(
    "different seeds produce replay variation",
    new Set(orders).size > 1,
    orders.join(" | "),
  );
  await debug.seed(page, 4242);
}

async function visualDrive(
  viewport,
  name,
  { reducedMotion = "no-preference", persistence = false } = {},
) {
  const session = await openSession(browser, {
    url,
    base,
    viewport,
    reducedMotion,
    seed: 4242,
    fastTimers: 20,
    mute: true,
    allowAbortedMedia: true,
  });
  const { page } = session;
  const requireFit = name === "compact";

  try {
    await debug.call(page, "clearBadges");
    await capture(page, `${name}-splash`, requireFit);
    await debug.tap(page, "play");
    await debug.waitForScreen(page, "select");
    await capture(page, `${name}-select`, requireFit);

    if (name === "desktop") await seedGate(page);

    await debug.fastTimers(page, 1);
    await debug.startMode(page, "firefighter");
    await debug.waitForScreen(page, "play");
    await capture(page, `${name}-play`, requireFit);

    let { wrong } = await currentTargets(page);
    report.check(
      `${name} exposes a wrong choice`,
      Boolean(wrong),
      JSON.stringify(wrong),
    );
    await debug.tap(page, wrong.id);
    await page.waitForFunction(() =>
      Boolean(document.querySelector(".chc-tool.is-wrong")),
    );
    await capture(page, `${name}-wrong`, requireFit);
    await page
      .locator('[data-qk-screen]:not([hidden]) [data-hud="back"]')
      .click();
    await page.waitForTimeout(350);
    report.check(
      `${name} Back cancels a pending retry`,
      (await debug.getState(page)).screen === "splash",
    );

    await debug.startMode(page, "firefighter");
    let { right } = await currentTargets(page);
    await debug.tap(page, right.id);
    await page
      .locator('[data-qk-screen]:not([hidden]) [data-hud="back"]')
      .click();
    await page.waitForTimeout(350);
    report.check(
      `${name} Back cancels a pending correct continuation`,
      (await debug.getState(page)).screen === "splash",
    );

    await debug.startMode(page, "firefighter");
    ({ right } = await currentTargets(page));
    const { slot } = await currentTargets(page);
    report.check(
      `${name} exposes correct tool and raster drop target`,
      Boolean(right && slot),
      JSON.stringify({ right, slot }),
    );
    await dragBetween(page, right.rect, slot.rect, { steps: 12 });
    await page.waitForTimeout(100);
    const dragResult = await page.evaluate(() => ({
      state: window.QLOBE_DEBUG.getState(),
      filled: Boolean(document.querySelector("[data-slot] img")),
      ghosts: document.querySelectorAll("[data-qk-drag-ghost]").length,
      slotAtCenter: (() => {
        const rect = document
          .querySelector("[data-slot]")
          ?.getBoundingClientRect();
        if (!rect) return null;
        return document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )?.outerHTML;
      })(),
    }));
    report.check(
      `${name} real pointer drag reaches the slot`,
      dragResult.filled,
      JSON.stringify(dragResult),
    );
    if (!dragResult.filled)
      throw new Error(`pointer drag failed: ${JSON.stringify(dragResult)}`);
    const snap = await debug.getState(page);
    report.check(
      `${name} holds a visible correct snap`,
      snap.screen === "play" && snap.round === 0 && snap.locked,
      JSON.stringify(snap),
    );
    await capture(page, `${name}-correct`, requireFit);
    await page.waitForFunction(() => window.QLOBE_DEBUG.getState().round === 1);
    await debug.fastTimers(page, 20);
    await debug.winRound(page);
    await debug.waitForScreen(page, "reward");
    await capture(page, `${name}-reward`, requireFit);

    if (persistence) {
      await page.reload({ waitUntil: "networkidle" });
      await debug.waitForHook(page);
      await debug.waitForReady(page);
      await debug.mute(page, true);
      await debug.fastTimers(page, 20);
      const restored = await debug.getState(page);
      report.check(
        "earned firefighter badge persists across reload",
        restored.earned.includes("firefighter"),
        JSON.stringify(restored),
      );
    }

    for (const helper of ["doctor", "teacher", "mail-carrier"]) {
      await completeHelper(page, helper);
    }
    const completed = await debug.getState(page);
    report.check(
      `${name} earns all four role badges`,
      completed.earned.length === 4,
      JSON.stringify(completed),
    );
    await capture(page, `${name}-reward-complete`, requireFit);
    await debug.tap(page, "finish");
    await debug.waitForScreen(page, "end");
    await capture(page, `${name}-end`, requireFit);
    await debug.call(page, "home");
    await debug.tap(page, "album");
    await debug.waitForScreen(page, "album");
    await capture(page, `${name}-album`, requireFit);

    if (reducedMotion === "reduce") {
      report.check(
        `${name} honors reduced-motion preference`,
        await page.evaluate(
          () => matchMedia("(prefers-reduced-motion: reduce)").matches,
        ),
      );
    }
    checkSessionClean(report, session, name);
  } finally {
    await session.close();
  }
}

async function storageDenialGate() {
  const session = await openSession(browser, {
    url,
    base,
    viewport: { width: 1180, height: 820 },
    initScript: () => {
      for (const method of ["getItem", "setItem", "removeItem"]) {
        Storage.prototype[method] = () => {
          throw new DOMException("Storage blocked for QA", "SecurityError");
        };
      }
    },
    fastTimers: 20,
    mute: true,
    allowAbortedMedia: true,
  });
  try {
    await completeHelper(session.page, "firefighter");
    const state = await debug.getState(session.page);
    report.check(
      "blocked localStorage keeps the earned badge for this session",
      state.screen === "reward" &&
        state.earned.includes("firefighter") &&
        state.journalMemoryOnly,
      JSON.stringify(state),
    );
    checkSessionClean(report, session, "storage-denial");
  } finally {
    await session.close();
  }
}

async function recordedVoiceGate() {
  const session = await openSession(browser, {
    url,
    base,
    viewport: { width: 1180, height: 820 },
    fastTimers: 20,
    mute: false,
    allowAbortedMedia: true,
  });
  try {
    await debug.clearAudioLog(session.page);
    await session.page.locator('[data-target="play"]').click();
    await debug.waitForAudio(session.page, "choose-helper", { timeout: 15000 });
    const entry = (await debug.getAudioLog(session.page)).find(
      (item) => item.key === "choose-helper",
    );
    report.check(
      "a real gesture selects recorded teacher narration",
      entry?.kind === "clip",
      JSON.stringify(entry),
    );
    const audioIntegrity = await session.page.evaluate(async () => {
      const [response, linesResponse] = await Promise.all([
        fetch("assets/audio/manifest.json"),
        fetch("assets/audio/lines.json"),
      ]);
      if (!response.ok) return [`manifest: HTTP ${response.status}`];
      if (!linesResponse.ok) return [`lines: HTTP ${linesResponse.status}`];
      const manifest = await response.json();
      const lines = await linesResponse.json();
      const failures = [];
      const manifestKeys = Object.keys(manifest).sort();
      const lineKeys = Object.keys(lines).sort();
      if (lineKeys.length !== 33) failures.push(`lines: expected 33, got ${lineKeys.length}`);
      if (manifestKeys.length !== 33) {
        failures.push(`manifest: expected 33, got ${manifestKeys.length}`);
      }
      if (JSON.stringify(manifestKeys) !== JSON.stringify(lineKeys)) {
        failures.push("manifest and lines key sets differ");
      }
      for (const [key, item] of Object.entries(manifest)) {
        try {
          const clip = await fetch(`assets/audio/${item.file}`);
          if (!clip.ok) {
            failures.push(`${key}: HTTP ${clip.status}`);
            continue;
          }
          const bytes = await clip.arrayBuffer();
          const digest = await crypto.subtle.digest("SHA-256", bytes);
          const actual = [...new Uint8Array(digest)]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
          if (bytes.byteLength < 1_000) failures.push(`${key}: clip is too small`);
          else if (actual !== item.sha256) failures.push(`${key}: SHA-256 mismatch`);
        } catch (error) {
          failures.push(`${key}: ${error}`);
        }
      }
      return failures;
    });
    report.check(
      "all 33 recorded narration clips load and match their manifest hashes",
      audioIntegrity.length === 0,
      audioIntegrity.join(" | "),
    );
    checkSessionClean(report, session, "recorded-voice");
  } finally {
    await session.close();
  }
}

async function hubGate() {
  const optionalAnalytics = [
    "https://www.googletagmanager.com/",
    "https://www.google-analytics.com/",
  ];
  const session = await openSession(browser, {
    url: `${base}/#culture-geography`,
    base,
    ready: false,
    waitUntil: "load",
    viewport: { width: 1180, height: 820 },
    allowRemote: optionalAnalytics,
  });
  try {
    const card = session.page.locator(
      'a.game-card[href$="games/community-helper-cards/"]',
    );
    await card.waitFor({ state: "visible" });
    const tileReady = await card
      .locator("img")
      .evaluate((image) => image.complete && image.naturalWidth > 0);
    report.check(
      "hub exposes the beta game with a loaded curated tile",
      tileReady,
    );
    await card.click();
    await session.page.waitForURL("**/games/community-helper-cards/");
    await debug.waitForHook(session.page);
    await debug.waitForReady(session.page);
    report.check(
      "hub navigation boots the game splash",
      (await debug.getState(session.page)).screen === "splash",
    );
    const unexpectedFailures = session.failed.filter(
      (failure) => !optionalAnalytics.some((prefix) => failure.startsWith(prefix)),
    );
    report.check(
      "hub failures, if any, are limited to optional platform analytics",
      unexpectedFailures.length === 0,
      unexpectedFailures.join(" | "),
    );
    checkSessionClean(
      report,
      { ...session, failed: unexpectedFailures },
      "hub-navigation",
    );
  } finally {
    await session.close();
  }
}

try {
  await hubGate();
  await visualDrive({ width: 1180, height: 820 }, "desktop", {
    persistence: true,
  });
  await visualDrive({ width: 768, height: 1024 }, "portrait");
  await visualDrive({ width: 844, height: 390 }, "compact", {
    reducedMotion: "reduce",
  });
  await storageDenialGate();
  await recordedVoiceGate();
} finally {
  await browser.close();
}

report.finish({ suffix: `; screenshots in ${shots}`, exit: true });
