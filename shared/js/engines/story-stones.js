// Story Stones — data-driven story resolver and exact Pixi stage.
// The resolver is pure so Studio, the game, and exhaustive tests consume the
// same combinatorial library. V2 stories are unordered at selection time and
// own their complete three-beat narrative, cast order, and backdrop.

import { createStage } from '../stage/stage.js';
import { createTheater } from '../stage/theater.js';
import { normalizePropPack, propRuntimeDefinition } from '../stage/prop-pack.js';

const POSITIONS = [0.28, 0.50, 0.72];
const ROLES = ['first','second','third'];
const DEFAULT_POSE_CUES = {
  beginning:{ reveal:{ first:'enter' }, story:{ first:'notice' }, settle:{ first:'neutral' } },
  complication:{ reveal:{ second:'enter' }, story:{ first:'interact', second:'react' }, settle:{ first:'neutral', second:'neutral' } },
  resolution:{ reveal:{ third:'enter' }, story:{ first:'celebrate', second:'celebrate', third:'celebrate' }, settle:{ first:'celebrate', second:'celebrate', third:'celebrate' } },
  opening:{ reveal:{ first:'enter' }, story:{ first:'notice' }, settle:{ first:'neutral' } },
  encounter:{ reveal:{ second:'enter' }, story:{ first:'interact', second:'react' }, settle:{ first:'neutral', second:'neutral' } },
  finale:{ reveal:{ third:'enter' }, story:{ first:'celebrate', second:'celebrate', third:'celebrate' }, settle:{ first:'celebrate', second:'celebrate', third:'celebrate' } },
};

export function pairId(a, b) { return [a, b].sort().join('--'); }
export function combinationId(ids) {
  if (!Array.isArray(ids) || ids.length !== 3 || new Set(ids).size !== 3) {
    throw new Error('A story needs three different stones.');
  }
  return [...ids].sort().join('--');
}

export function resolveStory(pack, ids) {
  if (!pack || pack.format !== 'qlobe-story-pack') throw new Error('Story Pack is missing or invalid.');
  const key = combinationId(ids);
  const byId = Object.fromEntries(pack.stones.map((stone) => [stone.id, stone]));
  const selected = ids.map((id) => byId[id]);
  if (selected.some((stone) => !stone)) throw new Error('The story contains an unknown stone.');

  if ((pack.formatVersion || 1) >= 2) {
    const recipe = pack.stories?.[key];
    if (!recipe) throw new Error(`Story Pack has no story for ${key}.`);
    const canonical = [...ids].sort();
    if (combinationId(recipe.stoneIds || []) !== key) throw new Error(`Story ${key} has invalid stoneIds.`);
    const castOrder = recipe.castOrder || canonical;
    if (combinationId(castOrder) !== key) throw new Error(`Story ${key} has invalid castOrder.`);
    if (!Array.isArray(recipe.beats) || recipe.beats.length !== 3) throw new Error(`Story ${key} needs three beats.`);
    const stones = castOrder.map((id) => byId[id]);
    return {
      id: recipe.id || key,
      combinationId: key,
      ids: canonical,
      selectedIds: [...ids],
      castOrder: [...castOrder],
      stones,
      title: recipe.title,
      status: recipe.status,
      setting: recipe.setting,
      backdrop: recipe.setting?.backdrop || pack.backdrop,
      phases: recipe.beats.map((beat, index) => ({
        ...beat,
        id: beat.id || ['beginning','complication','resolution'][index],
        stoneIds: castOrder.slice(0, index + 1),
      })),
    };
  }

  const stones = selected;
  if (stones.some((stone) => !stone)) throw new Error('The story contains an unknown stone.');
  const opening = pack.openings[ids[0]], encounter = pack.pairs[pairId(ids[0], ids[1])], finale = pack.finales[ids[2]];
  if (!opening || !encounter || !finale) throw new Error(`Story Pack has an incomplete recipe for ${ids.join(', ')}.`);
  return {
    ids: [...ids], stones,
    phases: [
      { id: 'opening', stoneIds: [ids[0]], ...opening },
      { id: 'encounter', stoneIds: [ids[0], ids[1]], ...encounter },
      { id: 'finale', stoneIds: [...ids], ...finale },
    ],
  };
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`Could not load ${new URL(url, document.baseURI).pathname}`);
  return response.json();
}

export async function createStoryStage(host, pack, baseUrl, { narrate } = {}) {
  const base = new URL(baseUrl, document.baseURI);
  const actorPackUrl = new URL(pack.actorPack, base);
  const propPackUrl = new URL(pack.propPack, base);
  const [actorPack, rawProps, stage] = await Promise.all([
    fetchJson(actorPackUrl), fetchJson(propPackUrl), createStage(host),
  ]);
  const propPack = normalizePropPack(rawProps, propPackUrl.href);
  const theater = await createTheater(stage, {
    backdrop: pack.backdrop ? new URL(pack.backdrop, base).href : '#f5e7c5',
    floorY: pack.floorY ?? .86,
    worldScale: 1.55,
    narrate,
  });
  stage.root.addChild(theater.view);
  let playGeneration = 0;
  let current = null;

  function actorDescriptor(id) {
    const def = actorPack.actors[id];
    if (!def) return null;
    const actorBase = new URL(def.base || `${id}/`, actorPackUrl);
    return {
      id, baseUrl: actorBase.href, voice:false,
      renderMode:def.renderMode || 'puppet',
      rig:def.rig || 'rig.json', manifest:def.manifest || 'poses.json',
    };
  }

  function cuesFor(phase, moment) {
    return {
      ...(DEFAULT_POSE_CUES[phase.id]?.[moment] || {}),
      ...(pack.poseDefaults?.[phase.id]?.[moment] || {}),
      ...(phase.poseCues?.[moment] || {}),
    };
  }

  async function applyPoseMoment(phase, moment) {
    const cues=cuesFor(phase,moment), actions=[];
    for(const [role,pose] of Object.entries(cues)){
      const entry=current?.entries[ROLES.indexOf(role)];
      if(entry?.kind==='actor' && entry.actor.mode==='pose-sprite') actions.push(theater.setSpritePose(entry.actor,pose));
    }
    await Promise.all(actions);
  }

  async function loadStory(story) {
    theater.interrupt();
    Object.keys(theater.actors).forEach(theater.removeActor);
    theater.clearProps();
    current = { story, entries: [] };
    for (let index = 0; index < story.stones.length; index += 1) {
      const stone = story.stones[index], role = `stone-${index}`;
      if (stone.kind === 'actor') {
        const descriptor=actorDescriptor(stone.id), poseMode=descriptor.renderMode==='pose-sprite';
        const actor = poseMode
          ? await theater.addPoseActor(role,descriptor,{x:POSITIONS[index],flip:index===2,scale:.92,widthShare:.29})
          : await theater.addActor(role,descriptor,{x:POSITIONS[index],flip:index===2,scale:.84,widthShare:.28});
        actor.view.alpha=0;
        if(poseMode) actor.poseActor.preload(['neutral','enter','notice','interact','react','celebrate']).catch(()=>{});
        else actor.puppet.playClip('idle');
        current.entries.push({ kind: 'actor', id: role, actor, stone, index });
      } else {
        const def = propRuntimeDefinition(propPack, stone.id, {
          fx: POSITIONS[index], fy: pack.floorY ?? .86,
          presentation: { scale: (propPack.props[stone.id]?.presentation?.scale || .3) * 1.25 },
        });
        def.alpha = 0;
        const prop = await theater.addProp(role, def);
        current.entries.push({ kind: 'prop', id: role, prop, stone, index });
      }
    }
  }

  async function reveal(entry, side, phase) {
    if (entry.kind === 'actor') {
      entry.actor.view.alpha = 1;
      if(entry.actor.mode==='pose-sprite') await applyPoseMoment(phase,'reveal');
      else {
        await theater.runBeats([{ actor: entry.id, enter: side, to: [POSITIONS[entry.index]], ms: 900 }]);
        await theater.runBeats([{ actor: entry.id, clip: 'notice' }]);
      }
    } else {
      entry.prop.sprite.alpha = 0;
      entry.prop.scale *= .55;
      theater.layoutProp(entry.prop);
      await theater.runBeats([
        { prop: entry.id, transform: { alpha: 1, scale: entry.prop.scale / .55, y: pack.floorY ?? .86 }, ms: 650 },
        { fx: 'sparkle', at: entry.id },
      ]);
    }
  }

  async function play(ids, { timeScale = 1 } = {}) {
    const generation = ++playGeneration;
    const story = resolveStory(pack, ids);
    if (story.backdrop) await theater.setBackdrop(new URL(story.backdrop, base).href);
    await loadStory(story);
    theater.timeScale = timeScale;
    if (generation !== playGeneration) return story;

    await reveal(current.entries[0], 'left', story.phases[0]);
    await applyPoseMoment(story.phases[0],'story');
    await theater.narrate(story.phases[0].narrator, story.phases[0].text);
    await applyPoseMoment(story.phases[0],'settle');
    if (generation !== playGeneration) return story;

    await reveal(current.entries[1], 'right', story.phases[1]);
    const pairActions = current.entries.slice(0, 2).map((entry) => entry.kind === 'actor'
      ? null
      : { prop: entry.id, transform: { y: (pack.floorY ?? .86) - .07, rotation: entry.index ? .12 : -.12 }, ms: 650 });
    await Promise.all([applyPoseMoment(story.phases[1],'story'),theater.runBeats([{ parallel: pairActions.filter(Boolean) }, { fx: 'sparkle', at: current.entries[1].id }])]);
    await theater.narrate(story.phases[1].narrator, story.phases[1].text);
    await applyPoseMoment(story.phases[1],'settle');
    if (generation !== playGeneration) return story;

    await reveal(current.entries[2], 'right', story.phases[2]);
    const finaleActions = current.entries.map((entry) => entry.kind === 'actor'
      ? null
      : { prop: entry.id, transform: { y: (pack.floorY ?? .86) - .05, rotation: 0, scale: entry.prop.scale * 1.08 }, ms: 800 });
    await Promise.all([applyPoseMoment(story.phases[2],'story'),theater.runBeats([{ parallel: finaleActions.filter(Boolean) }, { fx: 'burst', at: current.entries[2].id }])]);
    await theater.narrate(story.phases[2].narrator, story.phases[2].text);
    await applyPoseMoment(story.phases[2],'settle');
    theater.runBeats([{ parallel: current.entries.filter((entry) => entry.kind === 'actor'&&entry.actor.mode==='puppet').map((entry) => ({ actor: entry.id, clip: 'idle', loop: true })) }]);
    return story;
  }

  function stop() { playGeneration += 1; theater.interrupt(); }
  function destroy() { stop(); theater.destroy(); stage.destroy(); }
  return { stage, theater, actorPack, propPack, play, stop, destroy, resolve: (ids) => resolveStory(pack, ids) };
}

export const __test = { pairId, combinationId, resolveStory };
