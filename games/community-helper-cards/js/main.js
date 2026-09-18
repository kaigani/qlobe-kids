import config from "../config.js";
import * as voice from "../../../shared/js/voice-clips.js";
import * as sfx from "../../../shared/js/sfx.js";
import * as bgm from "../../../shared/js/bgm.js";
import {
  installUnlockOnGesture,
  installKioskGuards,
} from "../../../shared/js/audio-unlock.js";
import { createScreens } from "../../../shared/js/screens.js";
import { createDragToSlotDom } from "../../../shared/js/stage/drag-to-slot-dom.js";
import { createJournal } from "../../../shared/js/journal.js";
import { hudButton } from "../../../shared/js/hud.js";
import { onTap } from "../../../shared/js/tap.js";
import { createTimers } from "../../../shared/js/timers.js";
import {
  installDebug,
  collectTargets,
} from "../../../shared/js/debug-harness.js";
import { tada } from "../../../shared/js/celebrate.js";
const root = document.querySelector("#game"),
  journal = createJournal(config.id, { version: 1 }),
  timers = createTimers(),
  tools = Object.fromEntries(config.tools.map((x) => [x.id, x]));
let helper,
  round = 0,
  locked = false,
  muted = false,
  run = 0,
  drag,
  seed = (Math.random() * 0xffffffff) >>> 0;
await voice.init(config.voice.manifest, config.voice.lines);
const lines = await fetch(config.voice.lines)
  .then((r) => r.json())
  .catch(() => ({}));
root.innerHTML =
  '<div class="chc">' +
  ["splash", "select", "play", "reward", "album", "end"]
    .map(
      (x, i) =>
        `<section class="chc-screen chc-${x}" data-qk-screen="${x}" ${i ? "hidden" : ""}></section>`,
    )
    .join("") +
  "</div>";
const $ = (x) => root.querySelector(`[data-qk-screen="${x}"]`),
  theater = () =>
    `<img class="chc-theater" src="${config.assets.theater}" alt="">`,
  alive = (t) => t === run,
  badge = (h) => h.badgeArt,
  order = () =>
    config.helpers
      .slice()
      .sort((a, b) => hash(a.id) - hash(b.id) || a.id.localeCompare(b.id)),
  choiceOrder = (r) =>
    r.choices
      .slice()
      .sort(
        (a, b) =>
          hash(`${helper.id}:${round}:${a}`) -
            hash(`${helper.id}:${round}:${b}`) || a.localeCompare(b),
      );
function hash(id) {
  let n = seed >>> 0;
  for (const c of id) n = Math.imul(n ^ c.charCodeAt(0), 2654435761) >>> 0;
  return n;
}
function stop() {
  run++;
  locked = false;
  drag?.detach();
  drag = null;
  timers.clearAll();
  voice.stop();
  bgm.duck(1, 80);
}
async function say(key) {
  if (muted) return;
  const token = run;
  const p = voice.say(key, lines[key]);
  bgm.duckDuring(p, { down: 0.08, downMs: 80, upMs: 200 });
  await p;
  return alive(token);
}
function hud(s, { home = false } = {}) {
  const h = document.createElement("div");
  h.className = "chc-hud";
  if (home)
    h.append(hudButton("home", () => location.assign("../../index.html")));
  else h.append(hudButton("back", () => show("splash")));
  const m = document.createElement("div");
  m.className = "chc-hud right";
  m.append(
    hudButton(
      "sound",
      () => {
        muted = !muted;
        voice.setMuted(muted);
        sfx.setMuted(muted);
        bgm.setMuted(muted);
      },
      { label: "Sound on or off" },
    ),
  );
  s.append(h, m);
}
function splash() {
  const s = $("splash");
  s.innerHTML = `${theater()}<div class="chc-content"><img class="chc-title" src="${config.assets.title}" alt="Community Helper Cards"><div class="chc-actions"><button class="chc-art-button" data-target="play" style="background-image:url('${config.assets.actionButton}')">Play</button><button class="chc-art-button" data-target="album" style="background-image:url('${config.assets.actionButton}')">My Album</button></div></div>`;
  hud(s, { home: true });
  onTap(s.querySelector("[data-target=play]"), () => show("select"));
  onTap(s.querySelector("[data-target=album]"), () => show("album"));
}
function select() {
  const s = $("select");
  s.innerHTML = `${theater()}<div class="chc-content"><h1 class="chc-heading">Choose a helper</h1><div class="chc-helper-grid">${order()
    .map(
      (h) =>
        `<button class="chc-helper ${journal.has(h.id) ? "is-earned" : ""}" data-target="helper-${h.id}" data-id="${h.id}" style="background-image:url('${h.card}');--badge:url('${badge(h)}')"><img src="${h.art}" alt=""><span>${h.name}</span></button>`,
    )
    .join("")}</div></div>`;
  hud(s);
  s.querySelectorAll("[data-id]").forEach((b) =>
    onTap(b, () => start(b.dataset.id)),
  );
}
function play() {
  const s = $("play"),
    r = helper.rounds[round];
  s.innerHTML = `${theater()}<div class="chc-content"><button class="chc-prompt" data-target="replay" style="background-image:url('${config.assets.promptPanel}')">${lines[r.promptKey]}</button><div class="chc-stage"><img class="chc-helper-hero" src="${helper.art}" alt="${helper.name}"><div class="chc-slot" data-slot data-target="drop-slot" style="background:url('${config.assets.toolCard}') center/contain no-repeat"><span class="visually-hidden">Drop tool here</span></div></div><div class="chc-tray" style="background-image:url('${config.assets.toolTray}')">${choiceOrder(
    r,
  )
    .map(
      (id) =>
        `<button class="chc-tool" data-target="tool-${id}" data-role="${id === r.tool ? "correct" : "wrong"}" data-tool="${id}" style="background-image:url('${config.assets.toolCard}')"><img src="${tools[id].art}" alt="${tools[id].name}" draggable="false"></button>`,
    )
    .join("")}</div></div>`;
  hud(s);
  onTap(s.querySelector("[data-target=replay]"), () => say(r.promptKey));
  drag = createDragToSlotDom({
    getPiece: (id) => s.querySelector(`[data-tool="${id}"]`),
    root: s,
    slotPad: 46,
    canStart: () => !locked,
    onDrop: (p, d) => d.slot && attempt(p.dataset.tool, p),
    makeGhost: (p) => {
      const g = p.querySelector("img").cloneNode();
      g.className = "chc-tool dragging";
      return g;
    },
  });
  s.querySelectorAll("[data-tool]").forEach((b) => {
    onTap(b, () => attempt(b.dataset.tool, b));
    b.onpointerdown = (e) => drag.begin(e, b.dataset.tool);
  });
}
async function attempt(id, node) {
  if (locked || !screens.is("play")) return false;
  const token = run;
  locked = true;
  const r = helper.rounds[round];
  if (id !== r.tool) {
    node.classList.add("is-wrong");
    await say("nudge");
    if (alive(token))
      timers.after(
        220,
        () =>
          alive(token) && (node.classList.remove("is-wrong"), (locked = false)),
      );
    return false;
  }
  $("play").querySelector("[data-slot]").innerHTML =
    `<img src="${tools[id].art}" alt="">`;
  sfx.pop();
  await say(r.successKey);
  if (!alive(token)) return false;
  tada({ host: $("play") });
  timers.after(240, () => {
    if (!alive(token)) return;
    round++;
    locked = false;
    if (round === 2) reward();
    else {
      play();
      say(helper.rounds[round].promptKey);
    }
  });
  return true;
}
async function start(id) {
  stop();
  helper = config.helpers.find((x) => x.id === id);
  round = 0;
  play();
  show("play", true);
  const token = run;
  await say(helper.introKey);
  if (alive(token)) say(helper.rounds[0].promptKey);
}
function emblem(h) {
  return badge(h);
}
function reward() {
  journal.add(helper.id, { name: helper.name });
  const s = $("reward");
  s.innerHTML = `${theater()}<div class="chc-content"><img class="chc-success" src="${helper.successArt}" alt="${helper.name}"><img class="chc-badge" src="${badge(helper)}" alt="${helper.name} Community Hero badge"><p class="chc-copy">${lines[helper.bioKey]}</p><button class="chc-art-button" data-target="next" style="background-image:url('${config.assets.actionButton}')">Next Helper</button>${journal.count() === 4 ? `<button class="chc-art-button" data-target="finish" style="background-image:url('${config.assets.actionButton}')">Celebrate!</button>` : ""}</div>`;
  hud(s);
  onTap(s.querySelector("[data-target=next]"), () => show("select"));
  s.querySelector("[data-target=finish]") &&
    onTap(s.querySelector("[data-target=finish]"), () => show("end"));
  show("reward", true);
  say(helper.bioKey);
}
function album() {
  const s = $("album");
  s.innerHTML = `${theater()}<div class="chc-content"><h1 class="chc-heading">My Helper Album</h1><div class="chc-album-grid">${order()
    .map(
      (h) =>
        `<div class="chc-album-item ${journal.has(h.id) ? "is-earned" : ""}" style="background-image:url('${h.card}')"><img src="${journal.has(h.id) ? badge(h) : h.art}" alt="${h.name}"></div>`,
    )
    .join(
      "",
    )}</div><button class="chc-art-button" data-target="choose" style="background-image:url('${config.assets.actionButton}')">Choose a Helper</button></div>`;
  hud(s);
  onTap(s.querySelector("[data-target=choose]"), () => show("select"));
}
function end() {
  const s = $("end");
  s.innerHTML = `${theater()}<div class="chc-content"><h1 class="chc-heading">Our community shines!</h1><p class="chc-copy">${lines["all-complete"]}</p><div class="chc-actions"><button class="chc-art-button" data-target="again" style="background-image:url('${config.assets.actionButton}')">Play Again</button><button class="chc-art-button" data-target="album" style="background-image:url('${config.assets.actionButton}')">My Album</button></div></div>`;
  hud(s);
  onTap(s.querySelector("[data-target=again]"), () => show("select"));
  onTap(s.querySelector("[data-target=album]"), () => show("album"));
}
const screens = createScreens({ root, initial: "splash", voice });
function show(n, keep = false) {
  if (!keep) stop();
  if (n === "splash") splash();
  if (n === "select") select();
  if (n === "album") album();
  if (n === "end") end();
  screens.show(n);
  if (n === "select") say("choose-helper");
  if (n === "album") say("album");
  if (n === "end") say("all-complete");
}
splash();
installUnlockOnGesture({
  extra: [voice.unlock, sfx.unlock, bgm.unlock],
  onFirst() {
    bgm.setVolume(config.music.volume);
    bgm.play(config.music.src, { key: config.music.key });
    say("welcome");
  },
});
installKioskGuards();
installDebug({
  gameId: config.id,
  ready: Promise.resolve(true),
  listModes: () => config.helpers.map((h) => ({ id: h.id, name: h.name })),
  startMode: start,
  getState: () => ({
    screen: screens.current,
    helper: helper?.id,
    round,
    earned: config.helpers.filter((h) => journal.has(h.id)).map((h) => h.id),
    journalMemoryOnly: journal.memoryOnly,
    locked,
    seed,
  }),
  getTargets: () => collectTargets(root),
  tap: (id) => {
    const e = root.querySelector(`[data-target="${id}"]`);
    e?.click();
    return !!e;
  },
  winRound: () =>
    screens.is("play") ? attempt(helper.rounds[round].tool) : false,
  mute: (on) => {
    muted = !!on;
    voice.setMuted(muted);
    sfx.setMuted(muted);
    bgm.setMuted(muted);
    if (muted) voice.stop();
    return muted;
  },
  timers,
  voice,
  sfx,
  onSeed: (_, n) => (seed = Number(n) >>> 0),
  home: () => show("splash"),
  getAudioLog: voice.getAudioLog,
  clearAudioLog: voice.clearAudioLog,
  clearBadges: () => journal.clear(),
});
