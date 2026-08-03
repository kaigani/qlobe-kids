import config from '../config.js';
import { createStoryStage, resolveStory } from '../../../shared/js/engines/story-stones.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';
import { installUnlockOnGesture } from '../../../shared/js/audio-unlock.js';
import { installDebug } from '../../../shared/js/debug-harness.js';
import { createDragToSlotDom } from '../../../shared/js/stage/drag-to-slot-dom.js';

const mount = document.querySelector('#game');
const HOME_IMG = new URL('../../../shared/assets/ui/btn-home.png', import.meta.url).href;
const SOUND_IMG = new URL('../../../shared/assets/ui/btn-sound.png', import.meta.url).href;
const SPLASH_TITLE_IMG = new URL('../assets/ui/splash-title.webp', import.meta.url).href;
const SELECT_TITLE_IMG = new URL('../assets/ui/select-title.webp', import.meta.url).href;
let pack;
let selection = [];
let stageRuntime = null;
let screen = 'splash';
let fastMode = false;

function esc(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
function stone(id) { return pack.stones.find((item) => item.id === id); }
function thumb(item) { return new URL(item.thumbnail, location.href).href; }
function normalizeSelection(ids) {
  const order = new Map(pack.stones.map((item,index)=>[item.id,index]));
  return [...new Set(ids)].filter((id)=>order.has(id)).sort((a,b)=>order.get(a)-order.get(b)).slice(0,3);
}
// Global first-gesture audio unlock. The latch reopens on visibilitychange/
// pageshow (shared/js/audio-unlock.js) so audio revives after an iPadOS app
// switch or screen lock instead of staying silent for the rest of the
// session — the story-stones stale-guard bug this migration fixes.
installUnlockOnGesture();

function chrome() {
  return `<div class="ss-top"><a class="round chrome-button" href="${config.home}" aria-label="Home" data-target="home"><img src="${HOME_IMG}" alt=""></a><button class="round chrome-button" data-sound aria-label="Replay prompt" data-target="sound"><img src="${SOUND_IMG}" alt=""></button></div>`;
}

async function say(key, text) { return voiceClips.say(key, text); }

function renderSplash() {
  screen = 'splash'; stageRuntime?.destroy(); stageRuntime = null;
  const featured = ['dragon','orange-cat','magic-rock','owl','treasure-chest'].map((id) => `<img src="${thumb(stone(id))}" alt="${esc(stone(id).label)}">`).join('');
  mount.innerHTML = `<section class="ss-screen ss-splash">${chrome()}<div class="ss-hills"></div><div class="splash-content">
    <h1 class="logo-art"><img src="${SPLASH_TITLE_IMG}" alt="Castle Meadow — Story Stones"></h1><div class="featured">${featured}</div>
    <button class="primary" data-start data-target="start">Start Story</button></div></section>`;
  mount.querySelector('[data-start]').onclick = () => { sfx.pop(); renderSelect(); say('choose-three', pack.prompts.intro); };
  mount.querySelector('[data-sound]').onclick = () => say('welcome', 'Welcome to Story Stones!');
}

function slotMarkup(index) {
  const item = stone(selection[index]);
  return `<button class="slot${item ? ' filled' : ''}" data-slot="${index}" data-target="slot-${index}" aria-label="${item ? `Remove ${esc(item.label)}` : 'Empty place in the story-stone tray'}">
    ${item ? `<img src="${thumb(item)}" alt="">` : '＋'}</button>`;
}

function renderSelect() {
  screen = 'select'; stageRuntime?.destroy(); stageRuntime = null;
  mount.innerHTML = `<section class="ss-screen ss-select">${chrome()}<div class="ss-hills"></div><h1 class="select-title"><img src="${SELECT_TITLE_IMG}" alt="Story Stones"></h1>
    <div class="slot-tray">${[0,1,2].map(slotMarkup).join('')}</div><div class="select-body"><p class="prompt">${esc(pack.prompts.intro)}</p>
    <div class="stone-grid">${pack.stones.map((item) => `<button class="stone${selection.includes(item.id) ? ' selected' : ''}" data-stone="${item.id}" data-target="stone-${item.id}" style="--stone:${item.color}">
      <img src="${thumb(item)}" alt=""><strong>${esc(item.label)}</strong></button>`).join('')}</div>
    <button class="round yellow go${selection.length === 3 ? ' ready' : ''}" data-go data-target="go" aria-label="Play story">➜</button></div></section>`;
  mount.querySelector('.ss-top a').onclick = (event) => { event.preventDefault(); renderSplash(); };
  mount.querySelector('[data-sound]').onclick = () => say('choose-three', pack.prompts.intro);
  mount.querySelectorAll('[data-stone]').forEach((button) => installStoneInput(button));
  mount.querySelectorAll('[data-slot]').forEach((button) => installSlotInput(button));
  mount.querySelector('[data-go]').onclick = () => { if (selection.length === 3) { sfx.tada(); renderStory(); } };
}

function addStone(id) {
  if (selection.includes(id)) return;
  if (selection.length < 3) selection.push(id);
  selection = normalizeSelection(selection);
  sfx.pop(); renderSelect();
  if (selection.length === 3) say('stones-ready', pack.prompts.ready);
}

// `sfx.tap` has never existed (the module's tick/pop/unpop are the press
// sounds), so this threw a TypeError *before* renderSelect() — the stone left
// `selection` and the tray never redrew, so tapping a filled slot looked like
// nothing happened while the state quietly changed underneath. unpop() is pop()'s
// inverse and is what taking something back should sound like.
function removeSlot(index) { if (selection[index]) { selection.splice(index, 1); sfx.unpop(); renderSelect(); } }

// One controller for the whole game, not one per button: "one drag at a time"
// only means anything if there is one thing enforcing it. renderSelect() rebuilds
// the grid on every pick, so the controller resolves the live button by id at
// pointerdown rather than closing over an element that may already be detached.
// The shared module also puts the move/up/cancel listeners on `window` instead of
// on the button, which is what stops a re-render mid-drag from stranding a ghost
// stone on the screen with no way to put it down.
const stoneDrag = createDragToSlotDom({
  getPiece: (id) => mount.querySelector(`[data-stone="${CSS.escape(String(id))}"]`),
  canStart: () => screen === 'select',
  // Already in the tray: nothing to drag. Rejecting here means no listener is
  // attached and no ghost is ever built.
  onGrab: (button, drag) => !selection.includes(drag.id),
  // A cancelled drag (OS gesture takeover, palm reject, an iPad notification
  // eating the pointerup) is not a drop: the ghost goes away and the tray is
  // left untouched, rather than committing whatever slot happened to be under
  // the cancel coordinates. The module does all of that; there is nothing for
  // this game to undo, so there is no onCancel.
  onDrop: (button, drag) => { if (drag.slot) addStone(drag.id); },
});

function installStoneInput(button) {
  const id = button.dataset.stone;
  button.onclick = () => { if (!stoneDrag.active && !selection.includes(id)) addStone(id); };
  button.onpointerdown = (event) => { stoneDrag.begin(event, id); };
}

function installSlotInput(button) {
  button.onclick = () => removeSlot(+button.dataset.slot);
  button.ondragover = (event) => event.preventDefault();
}

async function renderStory() {
  screen = 'story';
  selection = normalizeSelection(selection);
  const resolved = resolveStory(pack,selection);
  const items = resolved.stones;
  mount.innerHTML = `<section class="ss-screen ss-story"><div class="story-stage"></div><div class="story-nav"><button class="round yellow" data-edit data-target="edit" aria-label="Change stones">‹</button></div>
    <div class="story-header">${items.map((item) => `<img src="${thumb(item)}" alt="${esc(item.label)}">`).join('')}</div>
    <div class="caption"><span data-caption>Building your story…</span><button class="choose-another" data-another data-target="another" hidden>Choose Another Story</button></div></section>`;
  const caption = mount.querySelector('[data-caption]');
  stageRuntime = await createStoryStage(mount.querySelector('.story-stage'), pack, location.href, {
    narrate: async (key, text) => { caption.textContent = text; await say(key, text); },
  });
  mount.querySelector('[data-edit]').onclick = () => { stageRuntime.stop(); renderSelect(); };
  mount.querySelector('[data-another]').onclick = () => { selection=[]; stageRuntime.stop(); renderSelect(); say('another-story',pack.prompts.another); };
  await playStory();
}

async function playStory() {
  const caption = mount.querySelector('[data-caption]');
  if (!stageRuntime || !caption) return;
  try {
    stageRuntime.theater.muted = fastMode;
    await stageRuntime.play(selection, { timeScale: fastMode ? 20 : 1 });
    mount.querySelector('[data-another]')?.removeAttribute('hidden');
  } catch (error) {
    console.error(error); caption.textContent = 'The stones are resting. Choose another story to try again.';
    mount.querySelector('[data-another]')?.removeAttribute('hidden');
  }
}

async function boot() {
  const response = await fetch(config.storyPack, { cache:'no-store' });
  pack = await response.json();
  const defaults = { welcome:'Welcome to Story Stones!','choose-three':pack.prompts.intro,'stones-ready':pack.prompts.ready,'another-story':pack.prompts.another };
  for (const story of Object.values(pack.stories || {})) for (const beat of story.beats || []) defaults[beat.narrator]=beat.text;
  await voiceClips.init('./assets/audio/manifest.json','./assets/audio/lines.json',defaults);
  renderSplash();

  // Story Stones has exactly one mode (its combinatorial storybook), no
  // right/wrong outcome to win, and no randomness anywhere in resolveStory()
  // or the shared engine — so seed() is left on the default inert stub
  // (no onSeed) rather than pretending there is something to pin, and
  // winRound/home are omitted rather than stubbed to a fake rejection.
  installDebug({
    gameId: config.id,
    engine: 'story-stones',
    ready: Promise.resolve(true),
    root: mount,
    voice: voiceClips,
    sfx,
    listModes: () => [{ id: 'storybook-library', title: 'Storybook Library', skill: 'open-ended combinatorial storytelling' }],
    startMode: async () => {
      selection = [];
      if (screen !== 'splash') renderSplash();
      const startButton = mount.querySelector('[data-target="start"]');
      if (startButton) startButton.click(); else renderSelect();
      return true;
    },
    getState: () => ({ screen, selection: [...selection], playing: !!stageRuntime }),
    // Real dispatch through the same DOM handlers a child's touch would hit —
    // not a simulated outcome. Elements with no data-target (none currently)
    // are simply not tappable this way.
    tap: async (id) => {
      const el = mount.querySelector(`[data-target="${CSS.escape(String(id))}"]`);
      if (!el) return false;
      el.click();
      return true;
    },
    // This game already has a fastMode boolean (drives theater.muted +
    // timeScale in playStory()) instead of a timers.js group; drive it
    // directly rather than relying on the default's inert timers.js swap-in.
    // Accepts either dialect the contract documents: fastTimers() ===
    // fastTimers(20) === fastTimers(0.05) all mean "fast"; fastTimers(1)
    // means "normal speed".
    fastTimers: (scale = 0.05) => {
      const n = Number(scale);
      const raw = Number.isFinite(n) && n > 0 ? (n > 1 ? 1 / n : n) : 0.05;
      const multiplier = Math.min(1, Math.max(0.01, raw));
      fastMode = multiplier < 1;
      return multiplier;
    },
    // ---- extras (declared, back-compat with the pre-migration hook) ----
    getPack: () => pack,
    resolve: (ids) => resolveStory(pack, ids),
    select: (ids) => { selection = normalizeSelection(ids); renderSelect(); },
    play: async (ids = selection) => { selection = normalizeSelection(ids); fastMode = true; await renderStory(); },
    setFast: (value) => { fastMode = !!value; },
    getRuntime: () => stageRuntime,
  });
}
boot().catch((error)=>{ console.error(error); mount.innerHTML=`<p style="padding:2rem;color:white">Story Stones could not start: ${esc(error.message)}</p>`; });
