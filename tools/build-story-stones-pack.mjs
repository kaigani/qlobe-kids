#!/usr/bin/env node
/** Materialize and validate the 220 complete unordered Story Stones stories. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = path.join(root, 'games/story-stones/story-pack.json');
const previous = JSON.parse(fs.readFileSync(output, 'utf8'));
const stones = previous.stones;
const stoneById = Object.fromEntries(stones.map((stone) => [stone.id, stone]));

const MODIFIERS = [
  ['Amber', 'honey-gold light', 'amber leaves twinkling at the edges'],
  ['Bluebell', 'soft blue morning light', 'bluebells nodding beside the path'],
  ['Bubble', 'pearly rainbow light', 'round dewdrops shining like bubbles'],
  ['Cinnamon', 'warm cinnamon sunset', 'russet leaves curling in the breeze'],
  ['Dandelion', 'bright spring daylight', 'dandelion clocks floating overhead'],
  ['Dewdrop', 'fresh silver morning light', 'tiny droplets sparkling on every leaf'],
  ['Firefly', 'gentle green twilight', 'fireflies making dotted lantern trails'],
  ['Giggling', 'playful lemon sunshine', 'curly plants seeming to giggle in the wind'],
  ['Honey', 'mellow golden afternoon light', 'hexagonal flowers and honey-coloured stones'],
  ['Lavender', 'calm violet evening light', 'lavender borders swaying beside the clearing'],
  ['Moonbeam', 'cosy moonlit blue', 'a broad moonbeam crossing the ground'],
  ['Peppermint', 'cool mint morning light', 'striped reeds and peppermint-green leaves'],
  ['Puddle', 'clear light after rain', 'mirror puddles reflecting the friendly sky'],
  ['Rainbow', 'cheerful light after a shower', 'a small rainbow resting beyond the clearing'],
  ['Singing', 'rosy musical dawn', 'bell-shaped flowers chiming in the breeze'],
  ['Stardust', 'deep indigo storybook dusk', 'tiny golden specks scattered across the path'],
  ['Sunflower', 'bold summer sunshine', 'sunflowers turning toward the open stage'],
  ['Tickle', 'breezy apricot daylight', 'feathery grasses brushing the stepping stones'],
  ['Twinkle', 'clear starry evening light', 'pinprick lights glowing in the hedges'],
  ['Velvet', 'soft plum twilight', 'velvety moss covering the quiet banks'],
];

const PLACES = [
  {
    name:'Acorn Village', scenic:'a tiny woodland village of acorn-roof cottages, winding paths, mossy fences, and a broad empty village green',
    problem:'the little bridge had lost a plank', clue:'a trail of round footprints stopped beside the stream',
    twist:'the stream began burbling faster', progress:'a clever crossing', resolved:'the bridge rested safely between both banks',
    celebration:'Cottage windows glowed while the village played happy music.'
  },
  {
    name:'Cloudberry Bakery', scenic:'an outdoor woodland bakery with berry-shaped ovens, floury bunting, a cobbled courtyard, and an uncluttered central floor',
    problem:'the breakfast bell would not ring', clue:'one silver bell-rope was tangled around the sign',
    twist:'a floury breeze crossed the courtyard', progress:'a neat loop', resolved:'the bell rang three buttery notes',
    celebration:'The ovens puffed sweet clouds and the bunting danced.'
  },
  {
    name:'Featherboat Harbour', scenic:'a gentle fantasy harbour with feather-shaped boats, lily-pad docks, painted boathouses, and a wide clear quay',
    problem:'the featherboats had drifted from their docks', clue:'a ribbon of ripples pointed toward the reeds',
    twist:'the harbour breeze changed direction', progress:'a path to shore', resolved:'the boats bobbed beside the quay again',
    celebration:'Bright flags rose while water clapped against the steps.'
  },
  {
    name:'Lantern Library', scenic:'a magical open-air library with tree-trunk shelves, paper lanterns, curling stairways, and a broad reading circle',
    problem:'all the story lanterns had gone dim', clue:'one glowing page peeked from beneath a reading cushion',
    twist:'the shelves hid the tallest lantern', progress:'a trail of light', resolved:'every lantern shone above its shelf',
    celebration:'Books fluttered their pages around the reading circle.'
  },
  {
    name:'Moonpetal Garden', scenic:'a moon-flower garden with pale blossoms, shell paths, low hedges, and a spacious circular lawn',
    problem:'the moonpetals would not open', clue:'a silvery melody hummed beneath the soil',
    twist:'a shy cloud covered the light', progress:'a garden rhythm', resolved:'the moonpetals opened in a glowing wave',
    celebration:'Soft petals swirled above the lawn in a parade.'
  },
  {
    name:'Pancake Hill', scenic:'a rounded storybook hill with buttery stepping stones, berry bushes, distant windmills, and a broad level picnic clearing',
    problem:'the picnic blanket kept sliding downhill', clue:'three flat stones made a pattern beside the basket',
    twist:'a gust lifted one corner', progress:'a steady picnic place', resolved:'the blanket rested on the sunny clearing',
    celebration:'Windmills turned while berry flags waved along the hill.'
  },
  {
    name:'Rainbow Post Office', scenic:'a whimsical woodland post office with rainbow mailboxes, winding delivery tracks, striped awnings, and an open sorting square',
    problem:'the letters had lost their colours', clue:'a faint painted arrow curved under the awning',
    twist:'the mailboxes began swapping places', progress:'a trail to each box', resolved:'every letter found its colour and home',
    celebration:'Awnings flipped up as envelopes danced around the square.'
  },
  {
    name:'Silver Reed Marsh', scenic:'a friendly marsh of silver reeds, round stepping islands, tiny wooden signs, and a dry open patch for the cast',
    problem:'the stepping islands had floated apart', clue:'a row of bubbles showed where the path used to be',
    twist:'the reeds hid the farthest island', progress:'a safe water route', resolved:'the islands formed a winding path',
    celebration:'Frogs hummed while the marsh signs spun with delight.'
  },
  {
    name:'Teacup Observatory', scenic:'a hilltop observatory shaped like a teacup, brass star maps, turning weather vanes, and a broad open viewing terrace',
    problem:'the telescope pointed down', clue:'a tiny constellation glittered across the floor tiles',
    twist:'the roof turned the wrong way', progress:'a line toward the sky', resolved:'the telescope found a bright constellation',
    celebration:'Weather vanes chimed across the starry terrace.'
  },
  {
    name:'Whispering Windmill', scenic:'a cosy meadow windmill with patchwork sails, low flower fields, a curving millstream, and an uncluttered grassy stage',
    problem:'the patchwork sails had stopped', clue:'a soft whistle came from the millstream gate',
    twist:'the smallest sail slipped loose', progress:'a cheerful breeze', resolved:'all four sails turned together',
    celebration:'Flower fields rippled as the windmill hummed a tune.'
  },
  {
    name:'Woolly Mountain Station', scenic:'a tiny mountain station with wool-textured peaks, a toy-like platform, cloud tunnels, and a wide clear waiting area',
    problem:'the cloud train could not find the station', clue:'a dotted puff of steam hovered above the tracks',
    twist:'woolly fog covered the platform', progress:'a clear signal', resolved:'the cloud train reached the platform',
    celebration:'Mountain flags bobbed as the station clock chimed hooray.'
  },
];

const ACTIONS = {
  'dragon': ['warmed the air', 'fanned its orange wings', 'drew a glowing tail-curl', 'lifted one piece carefully', 'puffed a bright spark'],
  'orange-cat': ['followed tiny paw-marks', 'patted one part into place', 'leaped across the gap', 'listened with forward whiskers', 'rolled a loose piece back'],
  'white-cat': ['noticed a pale glimmer', 'balanced on the edge', 'brushed the dust away', 'tapped a calm rhythm', 'found the safest route'],
  'friendly-monster': ['gave one gentle lift', 'stretched both long arms', 'hummed a friendly note', 'held everything steady', 'bounced out a helpful ripple'],
  'owl': ['spotted the hidden pattern', 'fanned a measured breeze', 'read the tiny signs', 'called a clear hoot', 'carried one light piece'],
  'croissant': ['rolled in a golden circle', 'sprinkled helpful crumbs', 'puffed into a cushion', 'balanced on its curved edge', 'shared a warm bakery scent'],
  'rose': ['opened with a rosy glow', 'sent petals dancing', 'pointed with its stem', 'filled the air with courage', 'bloomed at each kind idea'],
  'magic-rock': ['rolled toward the clue', 'glowed on safe ground', 'became flat and steady', 'tapped three sparkling beats', 'rumbled the pieces into line'],
  'treasure-chest': ['clicked open helpfully', 'stood firm like a step', 'rattled an answer', 'caught the drifting pieces', 'shone light across the ground'],
  'golden-key': ['spun toward the answer', 'unlocked a hidden catch', 'drew a golden line', 'fit the smallest opening', 'chimed at the right place'],
  'magic-bag': ['produced a soft ribbon', 'scooped up loose pieces', 'billowed into a sail', 'carried everything safely', 'pulled out a starry patch'],
  'wishing-star': ['lit the best path', 'twinkled a good idea', 'became a bright signal', 'sparkled around the gap', 'made a thoughtful wish'],
};

const BEGINNINGS = [
  (a,s,p,c)=>`${a} reached ${s}, where ${p}. ${a} ${c}.`,
  (a,s,p,c)=>`At ${s}, ${a} discovered that ${p}. So ${a} ${c}.`,
  (a,s,p,c)=>`${s} was ready for a lovely day, but ${p}. ${a} ${c}.`,
  (a,s,p,c)=>`${a} heard a curious sound at ${s}, where ${p}. Then ${a} ${c}.`,
  (a,s,p,c)=>`At ${s}, ${a} saw that ${p}. With a hopeful smile, ${a} ${c}.`,
];

const COMPLICATIONS = [
  (a,b,t,aa,ba,progress)=>`${b} joined just as ${t}. ${a} ${aa}, and ${b} ${ba}, making ${progress}.`,
  (a,b,t,aa,ba,progress)=>`Then ${t}, and ${b} hurried over. ${b} ${ba}; ${a} ${aa}; soon they had ${progress}.`,
  (a,b,t,aa,ba,progress)=>`${b} brought a new idea, but ${t}. ${a} ${aa}, while ${b} ${ba}, making ${progress}.`,
  (a,b,t,aa,ba,progress)=>`The puzzle grew trickier when ${t}. ${a} ${aa}, and ${b} ${ba}, until they saw ${progress}.`,
  (a,b,t,aa,ba,progress)=>`${b} noticed that ${t}. Side by side, ${a} ${aa} and ${b} ${ba}, creating ${progress}.`,
];

const RESOLUTIONS = [
  (c,ca,resolved,celebration)=>`At last, ${c} ${ca}, and ${resolved}. ${celebration}`,
  (c,ca,resolved,celebration)=>`${c} finished the plan and ${ca}. Soon, ${resolved}. ${celebration}`,
  (c,ca,resolved,celebration)=>`For the final touch, ${c} ${ca}. At once, ${resolved}. ${celebration}`,
  (c,ca,resolved,celebration)=>`One thing remained: ${c} ${ca}. That helped, and ${resolved}. ${celebration}`,
  (c,ca,resolved,celebration)=>`${c} took a turn and ${ca}. Together, all three made sure ${resolved}. ${celebration}`,
];

const subject = (id) => stoneById[id].label;
const action = (id, index) => ACTIONS[id][index % ACTIONS[id].length];
const combinations = [];
for (let a=0; a<stones.length; a+=1) for (let b=a+1; b<stones.length; b+=1) for (let c=b+1; c<stones.length; c+=1) {
  combinations.push([stones[a].id, stones[b].id, stones[c].id]);
}

function stableSeed(value) {
  let hash = 2166136261;
  for (const char of value) { hash ^= char.charCodeAt(0); hash = Math.imul(hash, 16777619); }
  return hash >>> 0;
}

function titleCase(value) { return value.replace(/\b\w/g, (letter) => letter.toUpperCase()); }

function buildStory(ids, index) {
  const key = [...ids].sort().join('--');
  const castOrder = [...ids].sort((left,right) => {
    const kind = (stoneById[left].kind === 'actor' ? 0 : 1) - (stoneById[right].kind === 'actor' ? 0 : 1);
    return kind || stones.findIndex((s)=>s.id===left)-stones.findIndex((s)=>s.id===right);
  });
  const [first, second, third] = castOrder;
  const [modifier, light, detail] = MODIFIERS[index % MODIFIERS.length];
  const place = PLACES[Math.floor(index / MODIFIERS.length)];
  const settingLabel = `${modifier} ${place.name}`;
  const settingPath = `assets/backdrops/stories/${key}.webp`;
  const seed = stableSeed(key);
  const firstAction = action(first,index);
  const firstTeamAction = action(first,index+1);
  const secondAction = action(second,index+2);
  const thirdAction = action(third,index+4);
  const beginning = BEGINNINGS[index % BEGINNINGS.length](subject(first), settingLabel, place.problem, firstAction);
  const complication = COMPLICATIONS[(index + Math.floor(index/7)) % COMPLICATIONS.length](subject(first),subject(second),place.twist,firstTeamAction,secondAction,place.progress);
  const resolution = RESOLUTIONS[(index + Math.floor(index/11)) % RESOLUTIONS.length](subject(third),thirdAction,place.resolved,place.celebration);
  const prompt = `Use case: illustration-story. Asset type: 16:9 Story Stones game backdrop. Primary request: ${settingLabel}, ${place.scenic}; ${detail}. Style/medium: cosy children's picture-book illustration, hand-painted gouache and coloured-pencil texture on warm paper, chunky charcoal contours, charming imperfect brush marks, matching the approved Story Stones seed 1337 art direction. Composition/framing: wide 16:9 view with a broad uncluttered lower-centre performance clearing and environmental detail around the edges. Lighting/mood: ${light}, gentle, magical, welcoming for ages 3–7. Constraints: environment only; preserve a clear floor for three separately composited story-stone sprites. Avoid: characters, creatures, people, food or loose hero objects in the performance area, text, letters, logo, watermark, UI, border, collage, photorealism, 3D.`;
  return {
    id:key, stoneIds:[...ids].sort(), castOrder,
    title:`${stoneById[first].label}, ${stoneById[second].label}, and ${stoneById[third].label} at ${settingLabel}`,
    status:'approved',
    setting:{ label:settingLabel, backdrop:settingPath, alt:`${settingLabel}, an open cosy storybook setting.`, prompt, seed, workflow:'krea2-turbo-t2i', width:1344, height:768, steps:8, cfg:1 },
    beats:[
      { id:'beginning', narrator:`story-${key}-beginning`, text:beginning },
      { id:'complication', narrator:`story-${key}-complication`, text:complication },
      { id:'resolution', narrator:`story-${key}-resolution`, text:resolution },
    ],
  };
}

const stories = Object.fromEntries(combinations.map((ids,index) => {
  const story = buildStory(ids,index);
  return [story.id,story];
}));

const poseDefaults = {
  beginning:{reveal:{first:'enter'},story:{first:'notice'},settle:{first:'neutral'}},
  complication:{reveal:{second:'enter'},story:{first:'interact',second:'react'},settle:{first:'neutral',second:'neutral'}},
  resolution:{reveal:{third:'enter'},story:{first:'celebrate',second:'celebrate',third:'celebrate'},settle:{first:'celebrate',second:'celebrate',third:'celebrate'}},
};

const pack = {
  format:'qlobe-story-pack', formatVersion:2, id:'story-stones-storybook-library',
  backdrop:'assets/backdrops/castle-meadow-storybook.webp', floorY:.86,
  actorPack:'assets/actors/pack.json', propPack:'assets/props/pack.json',
  poseDefaults, stones,
  prompts:{
    intro:'Choose any three story stones. Every group has its own story!',
    ready:'Your three stones are ready. Tap the arrow to begin!',
    another:'Choose three new stones for another story!',
  },
  stories,
};

function validate(value) {
  const errors=[];
  const entries=Object.entries(value.stories||{});
  if(entries.length!==220)errors.push(`expected 220 stories, found ${entries.length}`);
  const settings=new Set(), backdrops=new Set(), narrators=new Set(), texts=new Set();
  for(const [key,story] of entries){
    if([...story.stoneIds].sort().join('--')!==key)errors.push(`${key}: stoneIds mismatch`);
    if([...story.castOrder].sort().join('--')!==key)errors.push(`${key}: castOrder mismatch`);
    if(story.beats?.length!==3)errors.push(`${key}: needs 3 beats`);
    if(settings.has(story.setting?.label))errors.push(`${key}: duplicate setting label`);settings.add(story.setting?.label);
    if(backdrops.has(story.setting?.backdrop))errors.push(`${key}: duplicate backdrop`);backdrops.add(story.setting?.backdrop);
    const allText=story.beats.map((beat)=>beat.text).join(' ');
    if(texts.has(allText))errors.push(`${key}: duplicate story text`);texts.add(allText);
    for(const id of story.stoneIds){if(!allText.includes(stoneById[id].label))errors.push(`${key}: text omits ${stoneById[id].label}`);}
    for(const beat of story.beats){if(narrators.has(beat.narrator))errors.push(`${key}: duplicate narrator ${beat.narrator}`);narrators.add(beat.narrator);}
  }
  if(narrators.size!==660)errors.push(`expected 660 narrators, found ${narrators.size}`);
  if(errors.length)throw new Error(errors.slice(0,20).join('\n'));
}

validate(pack);
fs.writeFileSync(output,JSON.stringify(pack,null,2)+'\n');
console.log(`wrote ${path.relative(root,output)}: ${Object.keys(stories).length} complete stories, ${Object.keys(stories).length*3} beats`);
