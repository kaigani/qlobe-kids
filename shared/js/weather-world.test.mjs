import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// The site is browser-native ESM and deliberately has no package.json with a
// Node module type. Import the same source bytes as a data URL so this test can
// still be run directly with `node shared/js/weather-world.test.mjs`.
const source = await readFile(new URL('./weather-world.js', import.meta.url), 'utf8');
const moduleUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const { createWeatherWorld, resolveWeatherState, stepWeatherParticle } = await import(moduleUrl);

function fakeLayer() {
  const classes = new Set();
  const properties = new Map();
  return {
    classList: { toggle(name, active) { active ? classes.add(name) : classes.delete(name); } },
    style: { setProperty(name, value) { properties.set(name, value); } },
    classes,
    properties,
  };
}

console.log('weather-world: state resolution');
{
  const state = resolveWeatherState({ sun: 1, cloud: 1, rain: 1, wind: 4, allowRainbow: true, flowerStage: 'bloom' });
  assert.deepEqual(state, {
    sun: true, cloud: true, rain: true, wind: 1, allowRainbow: true,
    softCloud: false, rainCloud: true, rainbow: true, shade: true,
  });
  assert.equal('flowerStage' in state, false, 'flower state must remain game-owned');
  const soft = resolveWeatherState({ cloud: true, wind: -2 });
  assert.equal(soft.softCloud, true);
  assert.equal(soft.rainCloud, false);
  assert.equal(resolveWeatherState({ sun: true, rain: true }).rainbow, false, 'rainbow is gated for guided play');
}

console.log('weather-world: deterministic particle stepping');
{
  const falling = stepWeatherParticle(
    { kind: 'rain', x: 10, y: 20, vx: 10, vy: 100, size: 8, alpha: 1 },
    { rain: true, wind: 0.5 }, 0.25, { width: 200, height: 100, random: () => 0.25 },
  );
  assert.equal(falling.x, 11.55, 'dt is capped at 50ms and wind pushes rain');
  assert.equal(falling.y, 25);
  const respawn = stepWeatherParticle(
    { kind: 'rain', x: 20, y: 120, vx: 0, vy: 100, size: 8, alpha: 1 },
    { rain: true }, 0.01, { width: 200, height: 100, random: () => 0.25 },
  );
  assert.equal(respawn.y, -13.5, 'out-of-bounds rain respawns above the canvas');
  assert.equal(respawn.x, 50, 'respawn uses injected deterministic random');
  assert.equal(stepWeatherParticle({ kind: 'rain', alpha: 1 }, { rain: false }, 1, {}).alpha, 0);
  const leaf = stepWeatherParticle(
    { kind: 'leaf', x: 250, y: 20, size: 20, vx: 20, vy: 0, alpha: 1 },
    { wind: 1 }, 0.01, { width: 200, height: 100, random: () => 0.5 },
  );
  assert.equal(leaf.x, -32, 'out-of-bounds leaves respawn at the entering edge');
  assert.equal(stepWeatherParticle({ kind: 'leaf', alpha: 1 }, { wind: 0 }, 1, {}).alpha, 0);

  let steadyRain = { kind: 'rain', x: 10, y: 10, baseVx: 10, vx: 10, vy: 100, size: 8, alpha: 1 };
  let steadyLeaf = { kind: 'leaf', x: 10, y: 10, baseVx: 20, vx: 20, vy: 0, size: 20, alpha: 1 };
  for (let frame = 0; frame < 120; frame += 1) {
    steadyRain = stepWeatherParticle(steadyRain, { rain: true, wind: 1 }, 1 / 60, { width: 100000, height: 100000, random: () => 0.5 });
    steadyLeaf = stepWeatherParticle(steadyLeaf, { wind: 1 }, 1 / 60, { width: 100000, height: 100000, random: () => 0.5 });
  }
  assert.equal(steadyRain.vx, 52, 'rain derives wind from immutable base velocity each frame');
  assert.equal(steadyLeaf.vx, 125, 'leaves derive wind from immutable base velocity each frame');
}

console.log('weather-world: safe controller construction');
{
  const layers = { sun: fakeLayer(), cloud: fakeLayer(), rainCloud: fakeLayer(), rainbow: fakeLayer(), shade: fakeLayer(), tree: fakeLayer() };
  const canvas = {
    clientWidth: 320,
    clientHeight: 180,
    style: { setProperty() {} },
    getBoundingClientRect: () => ({ width: 320, height: 180 }),
    getContext: () => null,
  };
  const changes = [];
  const world = createWeatherWorld({ canvas, layers, random: () => 0.5, reducedMotion: true, onStateChange: (state) => changes.push(state) });
  await world.ready;
  const initial = world.getState();
  assert.deepEqual(initial.particleBudget, { rain: 6, leaf: 3 }, 'reduced motion cuts both particle budgets');
  world.set({ sun: true, cloud: true, rain: true, wind: 7, allowRainbow: true }, { immediate: true });
  const active = world.getState();
  assert.equal(active.wind, 1, 'controller clamps control values');
  assert.equal(layers.rainCloud.classes.has('is-active'), true);
  assert.equal(layers.cloud.classes.has('is-active'), false);
  assert.equal(layers.rainbow.classes.has('is-active'), true);
  assert.equal(layers.tree.properties.get('--weather-wind'), '1.000');
  assert.equal(changes.length, 1);
  world.reset();
  assert.equal(world.getState().rain, false);
  world.setMuted(true);
  world.destroy();
  world.destroy();

  const callbackFull = createWeatherWorld({ reducedMotion: () => false, random: () => 0.5 });
  const callbackReduced = createWeatherWorld({ reducedMotion: () => true, random: () => 0.5 });
  assert.deepEqual(callbackFull.getState().particleBudget, { rain: 34, leaf: 15 }, 'a false reduced-motion callback keeps full budgets');
  assert.deepEqual(callbackReduced.getState().particleBudget, { rain: 6, leaf: 3 }, 'a true reduced-motion callback cuts budgets');
  callbackFull.destroy();
  callbackReduced.destroy();
}

console.log('weather-world: all tests passed');
