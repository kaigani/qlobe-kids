import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(decodeURIComponent(new URL('..', import.meta.url).pathname.replace(/^\/+([A-Za-z]:)/, '$1')));
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'config.json'), 'utf8'));
const fruits = ['strawberry', 'banana', 'apple', 'lemon', 'cherry', 'pear'];
const stages = ['early', 'ripe', 'late'];

if (cfg.id !== 'happy-ripe-fruit' || cfg.progression?.rounds !== 3) throw Error('bad id/progression');
if (JSON.stringify(cfg.progression.fruits) !== JSON.stringify(fruits)) throw Error('fruit progression order');
if (JSON.stringify(Object.keys(cfg.assets.fruits)) !== JSON.stringify(fruits)) throw Error('fruit asset order');

const assetPaths = new Set();
function walk(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) walk(child);
    return;
  }
  if (typeof value !== 'string' || !value.startsWith('assets/')) return;
  if (value !== value.toLowerCase() || assetPaths.has(value)) throw Error(`bad/duplicate path: ${value}`);
  if (/\.svg$/i.test(value)) throw Error(`vector runtime art is forbidden: ${value}`);
  assetPaths.add(value);
}
walk(cfg.assets);

for (const relative of assetPaths) {
  const absolute = path.join(root, relative);
  if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) throw Error(`missing runtime asset: ${relative}`);
  if (fs.statSync(absolute).size === 0) throw Error(`empty runtime asset: ${relative}`);
}
if (!fs.existsSync(path.resolve(root, cfg.music))) throw Error(`missing music: ${cfg.music}`);
for (const relative of ['index.html', 'css/style.css', 'js/main.js']) {
  if (!fs.existsSync(path.join(root, relative))) throw Error(`missing runtime file: ${relative}`);
}

for (const fruit of fruits) {
  if (JSON.stringify(Object.keys(cfg.assets.fruits[fruit])) !== JSON.stringify(stages)) throw Error(`stage mapping: ${fruit}`);
  if (new Set(Object.values(cfg.assets.fruits[fruit])).size !== 3) throw Error(`duplicate stage art: ${fruit}`);
}

const voiceKeys = [
  'welcome', 'choose-patch', ...fruits.map((fruit) => `${fruit}-prompt`),
  'retry-early', 'retry-late', 'praise-one', 'praise-two', 'praise-three',
  ...fruits.map((fruit) => `${fruit}-complete`), 'finale', 'idle',
];
for (const key of voiceKeys) if (typeof cfg.voice[key] !== 'string' || !cfg.voice[key].trim()) throw Error(`missing voice line: ${key}`);
const manifest = JSON.parse(fs.readFileSync(path.join(root, cfg.assets.audio.manifest), 'utf8'));
for (const key of voiceKeys) {
  const entry = manifest[key];
  if (!entry?.file || !(entry.dur > 0)) throw Error(`missing recorded voice manifest entry: ${key}`);
  const clip = path.join(root, 'assets/audio', entry.file);
  if (!fs.existsSync(clip) || fs.statSync(clip).size < 1500) throw Error(`missing/short recorded clip: ${key}`);
}

console.log(`Happy Ripe Fruit static test passed (${fruits.length} fruits, ${assetPaths.size} asset paths, ${voiceKeys.length} recorded lines)`);
