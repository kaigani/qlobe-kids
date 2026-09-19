import config from "../config.js";
import * as voice from "../../../shared/js/voice-clips.js";
import * as sfx from "../../../shared/js/sfx.js";
import * as bgm from "../../../shared/js/bgm.js";
import {
  installUnlockOnGesture,
  installKioskGuards,
} from "../../../shared/js/audio-unlock.js";
import { createDragToSlotDom } from "../../../shared/js/stage/drag-to-slot-dom.js";
import { onTap } from "../../../shared/js/tap.js";
import { createTimers } from "../../../shared/js/timers.js";
import { preloadImages } from "../../../shared/js/preload.js";
import {
  installDebug,
  collectTargets,
} from "../../../shared/js/debug-harness.js";

const root = document.querySelector("#game");
const timers = createTimers();
const STAR_KEY = "qk-plan-do-review-stars-v1";
const FALLBACK_LINES = {
  intro: "Hi, friend! Let's make an awesome plan.",
  "plan-prompt": "First, make a plan. What would you like to do?",
  "plan-tower": "You planned to build a tower. Let's do it!",
  "plan-garden": "You planned to grow a garden. Let's do it!",
  "plan-picnic": "You planned to pack a picnic. Let's do it!",
  "do-prompt": "Now do your plan. Put each cozy piece where it belongs.",
  "do-nudge": "Almost! Look for the matching cozy outline.",
  "do-complete": "You did it! You followed your plan.",
  "feeling-prompt": "You did your plan. How did it feel?",
  "feeling-happy": "Happy! Your work brought a smile.",
  "feeling-proud": "Proud! You kept going and finished.",
  "feeling-challenged": "Challenged! Tricky work helps your brain grow.",
  "feeling-calm": "Calm! You found your steady feeling.",
  "skill-prompt": "What helped you do it?",
  "skill-patience": "Patience helped you take your time.",
  "skill-problem-solving": "Problem solving helped you find a way.",
  "skill-creativity": "Creativity helped you make it your way.",
  reward: "Plan, do, review! You made your day awesome.",
  again: "Let's make another awesome plan!",
};

const state = {
  screen: "splash",
  selectedActivityId: null,
  selectedPieceId: null,
  placedPieceIds: [],
  feeling: null,
  skill: null,
  stars: readStars(),
  muted: false,
  locked: false,
  reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches,
  seed: 42,
  lastVoiceKey: "intro",
  dragStage: "idle",
};

let sceneToken = 0;
let drag = null;
let tapDisposers = [];

await voice.init(config.voice.manifest, config.voice.lines, FALLBACK_LINES);
const lineDocument = await fetch(config.voice.lines)
  .then((response) => (response.ok ? response.json() : {}))
  .catch(() => ({}));

const line = (key) => {
  const value = lineDocument[key];
  if (typeof value === "string") return value;
  if (value && typeof value.text === "string") return value.text;
  return FALLBACK_LINES[key] || "";
};

const criticalReady = preloadImages([
  config.backgrounds.plan,
  config.ui.title,
  config.ui.playButton,
  config.ui.jar,
  config.ui.star,
  config.characters.idle,
]);
preloadImages(allImageUrls(), { idle: true });
bgm.preload(config.music.src);
await criticalReady;

function allImageUrls() {
  return [
    ...Object.values(config.backgrounds),
    ...Object.values(config.characters),
    ...Object.values(config.ui),
    ...config.activities.flatMap((activity) => [
      activity.preview,
      ...activity.pieces.map((piece) => piece.art),
    ]),
    ...config.feelings.map((item) => item.art),
    ...config.skills.map((item) => item.art),
  ];
}

function readStars() {
  try {
    return Math.max(0, Math.min(5, Number(localStorage.getItem(STAR_KEY)) || 0));
  } catch {
    return 0;
  }
}

function saveStars() {
  try {
    localStorage.setItem(STAR_KEY, String(state.stars));
  } catch {
    // The ritual remains complete when storage is unavailable.
  }
}

function activityById(id = state.selectedActivityId) {
  return config.activities.find((activity) => activity.id === id) || null;
}

function bindTap(element, action, options = {}) {
  if (!element) return;
  tapDisposers.push(
    onTap(element, action, {
      feedback: options.feedback || (() => sfx.tick()),
    }),
  );
}

function clearScene() {
  sceneToken += 1;
  state.locked = false;
  drag?.detach();
  drag = null;
  for (const dispose of tapDisposers) dispose();
  tapDisposers = [];
  timers.clearAll();
  voice.stop();
}

async function say(key) {
  state.lastVoiceKey = key;
  const token = sceneToken;
  const speaking = voice.say(key, line(key));
  bgm.duckDuring(speaking, { down: 0.08, downMs: 80, upMs: 220 });
  await speaking;
  return token === sceneToken;
}

function roomBackground(kind) {
  return kind === "do"
    ? config.backgrounds.do
    : kind === "review"
      ? config.backgrounds.review
      : config.backgrounds.plan;
}

function hudMarkup({ back = false } = {}) {
  const backButton = back
    ? `<button class="hud-button" data-target="back" aria-label="Go back"><img src="${config.ui.back}" alt=""></button>`
    : "";
  return `
    <nav class="hud hud-left" aria-label="Game navigation">
      <button class="hud-button" data-target="catalog" aria-label="Go to all games"><img src="${config.ui.home}" alt=""></button>
      ${backButton}
    </nav>
    <nav class="hud hud-right" aria-label="Sound controls">
      <button class="hud-button" data-target="replay" aria-label="Hear the prompt again"><img src="${config.ui.replay}" alt=""></button>
      <button class="hud-button" data-target="sound" aria-label="Turn sound on or off" aria-pressed="${state.muted}"><img src="${state.muted ? config.ui.soundOff : config.ui.sound}" alt=""></button>
    </nav>`;
}

function promptMarkup(text, headingLevel = 1) {
  const tag = headingLevel === 2 ? "h2" : "h1";
  return `<div class="prompt-plaque"><img src="${config.ui.promptPlaque}" alt=""><${tag}>${text}</${tag}></div>`;
}

function sceneMarkup(kind, screenClass, content, { back = false } = {}) {
  return `<section class="game-scene ${screenClass}" data-screen="${state.screen}" data-qk-screen="${state.screen}">
    <img class="room-background" src="${roomBackground(kind)}" alt="">
    ${hudMarkup({ back })}
    ${content}
  </section>`;
}

function starJarMarkup({ reward = false } = {}) {
  const count = state.stars;
  const stars = Array.from({ length: count }, (_, index) => {
    const arriving = reward && index === count - 1 ? " is-arriving" : "";
    return `<img class="jar-star jar-star-${index + 1}${arriving}" src="${config.ui.star}" alt="">`;
  }).join("");
  return `<div class="star-jar ${count === 5 ? "is-full" : ""}" aria-label="${count} of 5 Awesome Day stars">
    <img class="jar-art" src="${config.ui.jar}" alt="">
    ${stars}
    ${count === 5 ? `<img class="jar-sparkle" src="${config.ui.sparkle}" alt="">` : ""}
  </div>`;
}

function actionButton(target, label, art, disabled = false) {
  return `<button class="art-action" data-target="${target}" ${disabled ? "disabled" : ""}><img class="action-carrier" src="${art}" alt=""><span>${label}</span></button>`;
}

function renderSplash() {
  const content = `<div class="splash-layout">
    <div class="splash-copy">
      <h1 class="visually-hidden">My Awesome Day</h1>
      <img class="title-art" src="${config.ui.title}" alt="My Awesome Day">
      <p class="splash-kicker">Plan it. Do it. Think about it!</p>
      ${actionButton("play", "Let's Play!", config.ui.playButton)}
    </div>
    <img class="barnaby barnaby-splash" src="${config.characters.idle}" alt="Barnaby, a friendly purple puppet">
    <div class="splash-jar">${starJarMarkup()}</div>
  </div>`;
  root.innerHTML = sceneMarkup("plan", "splash-screen", content);
  bindCommonHud();
  bindTap(root.querySelector('[data-target="play"]'), beginRitual);
}

function renderPlan() {
  const selected = activityById();
  const cards = config.activities
    .map(
      (activity) => `<button class="plan-card ${activity.id === state.selectedActivityId ? "is-selected" : ""}" data-target="plan-${activity.id}" data-plan="${activity.id}" aria-pressed="${activity.id === state.selectedActivityId}">
        <img class="carrier-art card-carrier" src="${config.ui.planCard}" alt="">
        <img class="plan-card-preview" src="${activity.preview}" alt="">
        <span>${activity.label}</span>
        ${activity.id === state.selectedActivityId ? `<img class="selected-sparkle" src="${config.ui.sparkle}" alt="">` : ""}
      </button>`,
    )
    .join("");
  const content = `<div class="plan-layout">
    <img class="barnaby barnaby-plan" src="${selected ? config.characters.point : config.characters.idle}" alt="Barnaby ${selected ? "points to your plan" : "is ready to help"}">
    <div class="plan-board">
      <img class="carrier-art board-carrier" src="${config.ui.planBoard}" alt="">
      ${promptMarkup("First, make a plan.", 1)}
      <p class="screen-subtitle">What would you like to do?</p>
      <div class="plan-grid">${cards}</div>
      <div class="plan-start ${selected ? "is-ready" : ""}">${actionButton("start", selected ? `Start ${selected.shortLabel}!` : "Choose a Plan", config.ui.startButton, !selected)}</div>
    </div>
  </div>`;
  root.innerHTML = sceneMarkup("plan", "plan-screen", content, { back: true });
  bindCommonHud();
  root.querySelectorAll("[data-plan]").forEach((button) =>
    bindTap(button, () => choosePlan(button.dataset.plan)),
  );
  bindTap(root.querySelector('[data-target="start"]'), startActivity);
}

function renderDo() {
  const activity = activityById();
  if (!activity) {
    showPlan();
    return;
  }
  const slots = activity.pieces
    .map((piece) => {
      const placed = state.placedPieceIds.includes(piece.id);
      return `<button class="piece-slot ${placed ? "is-filled" : ""}" data-slot="${piece.id}" data-target="slot-${piece.id}" aria-label="Place ${piece.label} here" style="--x:${piece.x}%;--y:${piece.y}%;--piece-size:${piece.size}%">
        <img src="${piece.art}" alt="" draggable="false">
      </button>`;
    })
    .join("");
  const pieces = activity.pieces
    .map((piece) => {
      const placed = state.placedPieceIds.includes(piece.id);
      return `<button class="tray-piece ${placed ? "is-placed" : ""}" data-piece="${piece.id}" data-target="piece-${piece.id}" aria-label="${piece.label}" aria-pressed="${state.selectedPieceId === piece.id}" ${placed ? "disabled" : ""}>
        <img src="${piece.art}" alt="${piece.label}" draggable="false">
      </button>`;
    })
    .join("");
  const progress = activity.pieces
    .map(
      (piece) => `<img class="progress-star ${state.placedPieceIds.includes(piece.id) ? "is-earned" : ""}" src="${config.ui.star}" alt="">`,
    )
    .join("");
  const content = `<div class="do-layout">
    <div class="do-topline">
      ${promptMarkup(`Now do your plan: ${activity.label}!`, 1)}
      <div class="progress-rope" aria-label="${state.placedPieceIds.length} of ${activity.pieces.length} pieces placed"><img class="carrier-art progress-carrier" src="${config.ui.progressRope}" alt="">${progress}</div>
    </div>
    <div class="do-workspace">
      <div class="play-mat" aria-label="Matching play mat">
        <img class="carrier-art mat-carrier" src="${config.ui.playMat}" alt="">
        ${slots}
        <img class="placement-sparkle" src="${config.ui.sparkle}" alt="" hidden>
      </div>
      <div class="piece-tray">
        <img class="carrier-art tray-carrier" src="${config.ui.pieceTray}" alt="">
        <p>Drag a piece, or tap it and its match.</p>
        <div class="piece-row">${pieces}</div>
      </div>
    </div>
  </div>`;
  root.innerHTML = sceneMarkup("do", "do-screen", content, { back: true });
  bindCommonHud();
  bindDoControls(activity);
}

function reviewPreviewMarkup() {
  const activity = activityById();
  return activity
    ? `<div class="review-work"><img src="${activity.preview}" alt="Your finished ${activity.shortLabel.toLowerCase()}"><span>You did your plan!</span></div>`
    : "";
}

function renderFeeling() {
  const choices = config.feelings
    .map(
      (item) => `<button class="reflection-choice" data-target="feeling-${item.id}" data-feeling="${item.id}">
        <img src="${item.art}" alt="">
        <span>${item.label}</span>
      </button>`,
    )
    .join("");
  const content = `<div class="review-layout">
    <img class="barnaby barnaby-review" src="${config.characters.cheer}" alt="Barnaby celebrates your work">
    ${reviewPreviewMarkup()}
    <div class="reflection-panel">
      ${promptMarkup("How did it feel?", 1)}
      <p class="screen-subtitle">Every feeling belongs.</p>
      <div class="feeling-grid">${choices}</div>
    </div>
  </div>`;
  root.innerHTML = sceneMarkup("review", "feeling-screen", content, { back: true });
  bindCommonHud();
  root.querySelectorAll("[data-feeling]").forEach((button) =>
    bindTap(button, () => chooseFeeling(button.dataset.feeling)),
  );
}

function renderLearning() {
  const choices = config.skills
    .map(
      (item) => `<button class="skill-choice" data-target="skill-${item.id}" data-skill="${item.id}">
        <img src="${item.art}" alt="">
        <span>${item.label}</span>
      </button>`,
    )
    .join("");
  const content = `<div class="review-layout learning-layout">
    <img class="barnaby barnaby-review" src="${config.characters.point}" alt="Barnaby thinks with you">
    ${reviewPreviewMarkup()}
    <div class="reflection-panel">
      ${promptMarkup("What helped you do it?", 1)}
      <p class="screen-subtitle">You can notice your learning power.</p>
      <div class="skill-grid">${choices}</div>
    </div>
  </div>`;
  root.innerHTML = sceneMarkup("review", "learning-screen", content, { back: true });
  bindCommonHud();
  root.querySelectorAll("[data-skill]").forEach((button) =>
    bindTap(button, () => chooseSkill(button.dataset.skill)),
  );
}

function renderReward() {
  const activity = activityById();
  const feeling = config.feelings.find((item) => item.id === state.feeling);
  const skill = config.skills.find((item) => item.id === state.skill);
  const content = `<div class="reward-layout">
    <img class="reward-sparkle reward-sparkle-left" src="${config.ui.sparkle}" alt="">
    <img class="reward-sparkle reward-sparkle-right" src="${config.ui.sparkle}" alt="">
    <img class="barnaby barnaby-reward" src="${config.characters.cheer}" alt="Barnaby cheers">
    <div class="reward-card">
      <img class="carrier-art board-carrier" src="${config.ui.planBoard}" alt="">
      ${promptMarkup("You made your day awesome!", 1)}
      <div class="reward-summary">
        ${activity ? `<img class="reward-preview" src="${activity.preview}" alt="Your ${activity.shortLabel.toLowerCase()}">` : ""}
        <p>You felt <strong>${feeling?.label || "ready"}</strong> and used <strong>${skill?.label || "your learning power"}</strong>.</p>
      </div>
      ${starJarMarkup({ reward: true })}
      <div class="reward-actions">
        ${actionButton("another-plan", "Choose Another Plan", config.ui.actionButton)}
        ${actionButton("my-day", "Back to My Awesome Day", config.ui.actionButton)}
      </div>
    </div>
  </div>`;
  root.innerHTML = sceneMarkup("review", "reward-screen", content, { back: true });
  bindCommonHud();
  bindTap(root.querySelector('[data-target="another-plan"]'), anotherPlan);
  bindTap(root.querySelector('[data-target="my-day"]'), showSplash);
}

function renderCurrent() {
  if (state.screen === "splash") renderSplash();
  else if (state.screen === "plan") renderPlan();
  else if (state.screen === "do") renderDo();
  else if (state.screen === "feeling") renderFeeling();
  else if (state.screen === "learning") renderLearning();
  else renderReward();
}

function changeScreen(screen, voiceKey, { speak = true } = {}) {
  clearScene();
  state.screen = screen;
  state.lastVoiceKey = voiceKey;
  renderCurrent();
  if (speak) void say(voiceKey);
  return true;
}

function bindCommonHud() {
  bindTap(root.querySelector('[data-target="catalog"]'), () => {
    location.assign("../../index.html");
  });
  bindTap(root.querySelector('[data-target="back"]'), goBack);
  bindTap(root.querySelector('[data-target="replay"]'), () => say(state.lastVoiceKey));
  bindTap(root.querySelector('[data-target="sound"]'), toggleSound);
}

function toggleSound() {
  setMuted(!state.muted);
  if (!state.muted) void say(state.lastVoiceKey);
  return state.muted;
}

async function beginRitual() {
  if (state.locked) return false;
  state.locked = true;
  const alive = await say("intro");
  if (alive) showPlan();
  return true;
}

function resetRound() {
  state.selectedPieceId = null;
  state.placedPieceIds = [];
  state.feeling = null;
  state.skill = null;
}

function showSplash() {
  state.selectedActivityId = null;
  resetRound();
  return changeScreen("splash", "intro", { speak: false });
}

function showPlan({ speak = true } = {}) {
  state.selectedActivityId = null;
  resetRound();
  return changeScreen("plan", "plan-prompt", { speak });
}

function choosePlan(id) {
  const activity = activityById(id);
  if (!activity || state.locked) return false;
  state.selectedActivityId = id;
  resetRound();
  clearScene();
  state.screen = "plan";
  state.lastVoiceKey = activity.planVoice;
  renderPlan();
  sfx.pop();
  void say(activity.planVoice);
  return true;
}

function startActivity() {
  if (!activityById() || state.locked) return false;
  resetRound();
  return changeScreen("do", "do-prompt");
}

function showFeeling() {
  state.selectedPieceId = null;
  return changeScreen("feeling", "feeling-prompt");
}

function showLearning() {
  return changeScreen("learning", "skill-prompt");
}

function showReward() {
  state.stars = Math.min(5, state.stars + 1);
  saveStars();
  return changeScreen("reward", "reward");
}

async function anotherPlan() {
  if (state.locked) return false;
  state.locked = true;
  const alive = await say("again");
  if (alive) showPlan();
  return true;
}

function goBack() {
  if (state.locked) return false;
  if (state.screen === "plan") return showSplash();
  if (state.screen === "do" || state.screen === "feeling") return showPlan();
  if (state.screen === "learning") return changeScreen("feeling", "feeling-prompt");
  if (state.screen === "reward") return showPlan();
  return false;
}

function bindDoControls(activity) {
  drag = createDragToSlotDom({
    root,
    slotPad: 44,
    hoverClass: "is-hover",
    getPiece: (id) => root.querySelector(`[data-piece="${id}"]`),
    canStart: () => state.screen === "do" && !state.locked,
    onGrab: (piece) => {
      state.dragStage = "grab";
      root.querySelectorAll("[data-slot]").forEach((slot) => {
        slot.classList.toggle("is-drop-active", slot.dataset.slot === piece.dataset.piece);
      });
      return true;
    },
    onLift: () => {
      state.dragStage = "lift";
    },
    makeGhost: (piece) => {
      const ghost = piece.querySelector("img").cloneNode();
      ghost.className = "drag-ghost";
      return ghost;
    },
    onDrop: (piece, record) => {
      state.dragStage = `drop:${record.slot?.dataset.slot || "none"}`;
      root.querySelectorAll(".is-drop-active").forEach((slot) => slot.classList.remove("is-drop-active"));
      return attemptPlacement(piece.dataset.piece, record.slot?.dataset.slot || null);
    },
    onCancel: () => {
      state.dragStage = "cancel";
      root.querySelectorAll(".is-drop-active").forEach((slot) => slot.classList.remove("is-drop-active"));
    },
  });

  root.querySelectorAll("[data-piece]").forEach((button) => {
    const select = () => selectPiece(button.dataset.piece);
    bindTap(button, select, { feedback: () => sfx.tick() });
    const onPointerDown = (event) => drag.begin(event, button.dataset.piece);
    button.addEventListener("pointerdown", onPointerDown);
    tapDisposers.push(() => button.removeEventListener("pointerdown", onPointerDown));
  });

  root.querySelectorAll("[data-slot]").forEach((button) =>
    bindTap(button, () => {
      if (state.selectedPieceId) {
        void attemptPlacement(state.selectedPieceId, button.dataset.slot);
      }
    }),
  );

  // Keep the declared argument meaningful for assertions and future variants.
  root.querySelector(".do-screen")?.setAttribute("data-activity", activity.id);
}

function selectPiece(id) {
  if (state.locked || state.placedPieceIds.includes(id)) return false;
  state.selectedPieceId = id;
  root.querySelectorAll("[data-piece]").forEach((button) => {
    const selected = button.dataset.piece === id;
    button.classList.toggle("is-selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  return true;
}

async function attemptPlacement(pieceId, slotId) {
  if (state.screen !== "do" || state.locked) return false;
  const activity = activityById();
  const piece = activity?.pieces.find((item) => item.id === pieceId);
  if (!piece || state.placedPieceIds.includes(pieceId)) return false;

  if (pieceId !== slotId) {
    state.locked = true;
    root.querySelector(`[data-piece="${pieceId}"]`)?.classList.add("is-near-miss");
    if (slotId) root.querySelector(`[data-slot="${slotId}"]`)?.classList.add("is-near-miss");
    const alive = await say("do-nudge");
    if (alive) {
      root.querySelectorAll(".is-near-miss").forEach((node) => node.classList.remove("is-near-miss"));
      state.locked = false;
    }
    return false;
  }

  state.placedPieceIds.push(pieceId);
  state.selectedPieceId = null;
  sfx.pop();
  updatePlacedPiece(piece);

  if (state.placedPieceIds.length === activity.pieces.length) {
    state.locked = true;
    const alive = await say("do-complete");
    if (alive) timers.after(420, showFeeling);
  }
  return true;
}

function updatePlacedPiece(piece) {
  const source = root.querySelector(`[data-piece="${piece.id}"]`);
  const slot = root.querySelector(`[data-slot="${piece.id}"]`);
  source?.classList.add("is-placed");
  if (source) source.disabled = true;
  slot?.classList.add("is-filled", "just-placed");
  timers.after(500, () => slot?.classList.remove("just-placed"));

  root.querySelectorAll(".progress-star").forEach((star, index) => {
    star.classList.toggle("is-earned", index < state.placedPieceIds.length);
  });
  const progress = root.querySelector(".progress-rope");
  progress?.setAttribute(
    "aria-label",
    `${state.placedPieceIds.length} of ${activityById().pieces.length} pieces placed`,
  );

  const sparkle = root.querySelector(".placement-sparkle");
  if (sparkle && slot) {
    sparkle.hidden = false;
    sparkle.style.left = `${piece.x}%`;
    sparkle.style.top = `${piece.y}%`;
    timers.after(520, () => {
      sparkle.hidden = true;
    });
  }
}

async function chooseFeeling(id) {
  const item = config.feelings.find((candidate) => candidate.id === id);
  if (!item || state.locked || state.screen !== "feeling") return false;
  state.locked = true;
  state.feeling = id;
  root.querySelector(`[data-feeling="${id}"]`)?.classList.add("is-selected");
  sfx.pop();
  const alive = await say(item.voice);
  if (alive) timers.after(300, showLearning);
  return true;
}

async function chooseSkill(id) {
  const item = config.skills.find((candidate) => candidate.id === id);
  if (!item || state.locked || state.screen !== "learning") return false;
  state.locked = true;
  state.skill = id;
  root.querySelector(`[data-skill="${id}"]`)?.classList.add("is-selected");
  sfx.pop();
  const alive = await say(item.voice);
  if (alive) timers.after(300, showReward);
  return true;
}

async function debugWinRound() {
  if (state.screen === "splash") return showPlan({ speak: false });
  if (state.screen === "plan") {
    if (!state.selectedActivityId) choosePlan(config.activities[0].id);
    return startActivity();
  }
  if (state.screen === "do") {
    const activity = activityById();
    for (const piece of activity.pieces) {
      if (!state.placedPieceIds.includes(piece.id)) {
        state.locked = false;
        await attemptPlacement(piece.id, piece.id);
      }
    }
    return true;
  }
  if (state.screen === "feeling") return chooseFeeling(config.feelings[0].id);
  if (state.screen === "learning") return chooseSkill(config.skills[0].id);
  if (state.screen === "reward") return showPlan({ speak: false });
  return false;
}

function setMuted(on) {
  state.muted = Boolean(on);
  voice.setMuted(state.muted);
  sfx.setMuted(state.muted);
  bgm.setMuted(state.muted);
  if (state.muted) voice.stop();
  const button = root.querySelector('[data-target="sound"]');
  if (button) {
    button.setAttribute("aria-pressed", String(state.muted));
    button.querySelector("img").src = state.muted ? config.ui.soundOff : config.ui.sound;
  }
  return state.muted;
}

renderSplash();
installUnlockOnGesture({
  extra: [voice.unlock, sfx.unlock, bgm.unlock],
  onFirst() {
    bgm.setVolume(config.music.volume);
    bgm.play(config.music.src, { key: config.music.key });
  },
});
installKioskGuards();

installDebug({
  gameId: config.id,
  engine: config.engine,
  ready: criticalReady,
  listModes: () => [{ ...config.mode }],
  startMode: (id) => {
    if (id && id !== config.mode.id) return false;
    return showPlan({ speak: false });
  },
  getState: () => ({
    ...state,
    placedPieceIds: [...state.placedPieceIds],
    activity: state.selectedActivityId,
    progress: `${state.placedPieceIds.length}/4`,
    pendingTimers: timers.size(),
  }),
  getTargets: () => collectTargets(root),
  tap: (id) => {
    const element = root.querySelector(`[data-target="${id}"]`);
    element?.click();
    return Boolean(element);
  },
  winRound: debugWinRound,
  completeRound: debugWinRound,
  home: showSplash,
  mute: setMuted,
  timers,
  voice,
  sfx,
  onSeed: (_, seed) => {
    state.seed = Number(seed) >>> 0;
  },
  selectPlan: choosePlan,
  placePiece: (id) => attemptPlacement(id, id),
  selectFeeling: chooseFeeling,
  selectSkill: chooseSkill,
  replay: () => say(state.lastVoiceKey),
  clearStars: () => {
    state.stars = 0;
    saveStars();
    clearScene();
    renderCurrent();
    return true;
  },
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
});
