#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = []; const pass = (name, ok, detail = '') => { checks.push({ name, ok, detail }); };
const read = (name) => { const p = path.join(dir, name); pass(`file ${name}`, fs.existsSync(p)); return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : ''; };
const index = read('index.html'); const main = read('js/main.js'); const css = read('css/style.css');
const cfgPath = path.join(dir, 'config.json'); let cfg = null;
try { cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8')); pass('config parses', true); } catch (e) { pass('config parses', false, e.message); }
pass('runtime source present', Boolean(main)); pass('config present', Boolean(cfg));
if (cfg) {
  pass('exactly two modes', Array.isArray(cfg.modes) && cfg.modes.length === 2);
  pass('six scents', Array.isArray(cfg.scents) && cfg.scents.length === 6);
  for (const [key, value] of Object.entries(cfg.assets || {})) if (value.startsWith('./')) pass(`asset ${key}`, fs.existsSync(path.resolve(dir, value)));
  for (const scent of cfg.scents || []) for (const kind of ['token']) pass(`${kind}-${scent.id}`, fs.existsSync(path.join(dir, 'assets', 'art', `${kind}-${scent.id}.webp`)));
}
pass('index has splash/play/end screens', ['splash', 'play', 'end'].every((n) => index.includes(`data-qk-screen="${n}"`)));
pass('shared CSS imports', ['base.css', 'hud.css', 'screens.css'].every((n) => index.includes(n)));
pass('no inline SVG/canvas artwork', !/<svg|<canvas|createElement\(['"]canvas/i.test(`${index}\n${main}\n${css}`));
pass('96px target sizing', /min-(?:width|height)\s*:\s*(?:9[6-9]|[1-9]\d{2,})px/.test(css));
const audioDir = path.join(dir, 'assets', 'audio');
if (fs.existsSync(audioDir)) { pass('audio manifest present', fs.existsSync(path.join(audioDir, 'manifest.json'))); pass('audio lines present', fs.existsSync(path.join(audioDir, 'lines.json'))); }
const failed = checks.filter((c) => !c.ok);
for (const c of checks) console.log(`${c.ok ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
console.log(`Smell Jars QA: ${checks.length - failed.length}/${checks.length} checks passed`);
if (failed.length) process.exitCode = 1;
