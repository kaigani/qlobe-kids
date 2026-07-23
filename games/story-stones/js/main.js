import config from '../config.js';
import { createStoryStage, resolveStory } from '../../../shared/js/engines/story-stones.js';
import * as voiceClips from '../../../shared/js/voice-clips.js';
import * as sfx from '../../../shared/js/sfx.js';

const mount = document.querySelector('#game');
const HOME_IMG = new URL('../../../shared/assets/ui/btn-home.png', import.meta.url).href;
const SOUND_IMG = new URL('../../../shared/assets/ui/btn-sound.png', import.meta.url).href;
const SPLASH_TITLE_IMG = new URL('../assets/ui/splash-title.webp', import.meta.url).href;
const SELECT_TITLE_IMG = new URL('../assets/ui/select-title.webp', import.meta.url).href;
let pack;
let selection = [];
let stageRuntime = null;
let screen = 'splash';
let audioUnlocked = false;
let fastMode = false;

function esc(value) { const node = document.createElement('span'); node.textContent = value; return node.innerHTML; }
function stone(id) { return pack.stones.find((item) => item.id === id); }
function thumb(item) { return new URL(item.thumbnail, location.href).href; }
function normalizeSelection(ids) {
  const order = new Map(pack.stones.map((item,index)=>[item.id,index]));
  return [...new Set(ids)].filter((id)=>order.has(id)).sort((a,b)=>order.get(a)-order.get(b)).slice(0,3);
}
function unlock() { if (audioUnlocked) return; audioUnlocked = true; voiceClips.unlock(); sfx.unlock(); }
window.addEventListener('pointerdown', unlock, { passive: true });

function chrome() {
  return `<div class="ss-top"><a class="round chrome-button" href="${config.home}" aria-label="Home"><img src="${HOME_IMG}" alt=""></a><button class="round chrome-button" data-sound aria-label="Replay prompt"><img src="${SOUND_IMG}" alt=""></button></div>`;
}

async function say(key, text) { return voiceClips.say(key, text); }

function renderSplash() {
  screen = 'splash'; stageRuntime?.destroy(); stageRuntime = null;
  const featured = ['dragon','orange-cat','magic-rock','owl','treasure-chest'].map((id) => `<img src="${thumb(stone(id))}" alt="${esc(stone(id).label)}">`).join('');
  mount.innerHTML = `<section class="ss-screen ss-splash">${chrome()}<div class="ss-hills"></div><div class="splash-content">
    <h1 class="logo-art"><img src="${SPLASH_TITLE_IMG}" alt="Castle Meadow — Story Stones"></h1><div class="featured">${featured}</div>
    <button class="primary" data-start>Start Story</button></div></section>`;
  mount.querySelector('[data-start]').onclick = () => { sfx.pop(); renderSelect(); say('choose-three', pack.prompts.intro); };
  mount.querySelector('[data-sound]').onclick = () => say('welcome', 'Welcome to Story Stones!');
}

function slotMarkup(index) {
  const item = stone(selection[index]);
  return `<button class="slot${item ? ' filled' : ''}" data-slot="${index}" aria-label="${item ? `Remove ${esc(item.label)}` : 'Empty place in the story-stone tray'}">
    ${item ? `<img src="${thumb(item)}" alt="">` : '＋'}</button>`;
}

function renderSelect() {
  screen = 'select'; stageRuntime?.destroy(); stageRuntime = null;
  mount.innerHTML = `<section class="ss-screen ss-select">${chrome()}<div class="ss-hills"></div><h1 class="select-title"><img src="${SELECT_TITLE_IMG}" alt="Story Stones"></h1>
    <div class="slot-tray">${[0,1,2].map(slotMarkup).join('')}</div><div class="select-body"><p class="prompt">${esc(pack.prompts.intro)}</p>
    <div class="stone-grid">${pack.stones.map((item) => `<button class="stone${selection.includes(item.id) ? ' selected' : ''}" data-stone="${item.id}" style="--stone:${item.color}">
      <img src="${thumb(item)}" alt=""><strong>${esc(item.label)}</strong></button>`).join('')}</div>
    <button class="round yellow go${selection.length === 3 ? ' ready' : ''}" data-go aria-label="Play story">➜</button></div></section>`;
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

function removeSlot(index) { if (selection[index]) { selection.splice(index, 1); sfx.tap(); renderSelect(); } }

function installStoneInput(button) {
  let drag = null;
  button.onclick = () => { if (!drag && !selection.includes(button.dataset.stone)) addStone(button.dataset.stone); };
  button.onpointerdown = (event) => {
    if (selection.includes(button.dataset.stone)) return;
    const start = { x:event.clientX, y:event.clientY };
    const move = (e) => {
      if (!drag && Math.hypot(e.clientX-start.x,e.clientY-start.y) > 10) {
        drag = button.cloneNode(true); drag.classList.add('dragging'); document.body.append(drag); button.setPointerCapture(event.pointerId);
      }
      if (drag) { drag.style.left=`${e.clientX}px`; drag.style.top=`${e.clientY}px`; }
    };
    const up = (e) => {
      button.removeEventListener('pointermove',move); button.removeEventListener('pointerup',up); button.removeEventListener('pointercancel',up);
      if (drag) {
        const target = document.elementFromPoint(e.clientX,e.clientY)?.closest?.('[data-slot]');
        drag.remove(); drag = null; if (target) addStone(button.dataset.stone);
      }
    };
    button.addEventListener('pointermove',move); button.addEventListener('pointerup',up); button.addEventListener('pointercancel',up);
  };
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
  mount.innerHTML = `<section class="ss-screen ss-story"><div class="story-stage"></div><div class="story-nav"><button class="round yellow" data-edit aria-label="Change stones">‹</button></div>
    <div class="story-header">${items.map((item) => `<img src="${thumb(item)}" alt="${esc(item.label)}">`).join('')}</div>
    <div class="caption"><span data-caption>Building your story…</span><button class="choose-another" data-another hidden>Choose Another Story</button></div></section>`;
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
  window.QLOBE_DEBUG = {
    version:1, engine:'story-stones', ready:true,
    getState:()=>({screen,selection:[...selection],playing:!!stageRuntime}),
    getPack:()=>pack, resolve:(ids)=>resolveStory(pack,ids),
    select:(ids)=>{ selection=normalizeSelection(ids); renderSelect(); },
    play:async(ids=selection)=>{ selection=normalizeSelection(ids); fastMode=true; await renderStory(); },
    setFast:(value)=>{fastMode=!!value;},
    getRuntime:()=>stageRuntime,
  };
}
boot().catch((error)=>{ console.error(error); mount.innerHTML=`<p style="padding:2rem;color:white">Story Stones could not start: ${esc(error.message)}</p>`; });
