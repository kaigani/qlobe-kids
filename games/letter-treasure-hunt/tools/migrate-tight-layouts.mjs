#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const input = process.argv[2] || path.join(root, 'data/dz-scene-layouts.json');
const output = process.argv[3] || path.join(root, 'data/dz-scene-layouts-v2.json');
if (path.resolve(input) === path.resolve(output)) throw new Error('Refusing to overwrite input; provide a different output path');
const doc = JSON.parse(fs.readFileSync(input, 'utf8'));
if (doc.version !== 1 || !doc.letters || Object.keys(doc.letters).length !== 23) throw new Error('Expected v1 layout with exactly 23 letters');
for (const [l, s] of Object.entries(doc.letters)) if (Object.keys(s.hunt.targets).length !== 3 || Object.keys(s.completion.targets).length !== 3) throw new Error(`Invalid target count for ${l}`);

const distractors = { d:'apple', e:'ball', f:'cat', g:'ant', h:'butterfly', i:'cupcake', j:'alligator', k:'boat', l:'car', m:'apple', n:'ball', o:'cat', p:'ant', q:'butterfly', r:'cupcake', s:'alligator', t:'boat', u:'car', v:'apple', w:'ball', x:'cat', y:'ant', z:'butterfly' };
const art = new Set();
const sizes = new Map();
for (const [l, s] of Object.entries(doc.letters)) {
  for (const id of Object.keys(s.hunt.targets)) art.add(`../assets/papercraft/${l}-hunt/${id}.webp`);
  const d = distractors[l]; const letter = d === 'ant' || d === 'apple' || d === 'alligator' ? 'a' : d === 'ball' || d === 'boat' || d === 'butterfly' ? 'b' : 'c';
  art.add(`../assets/papercraft/${letter}-hunt/${d}.webp`);
}
art.add('../assets/papercraft/a-hunt/chest.webp'); art.add('../assets/papercraft/shared/open-chest.webp');
function trim(rel) {
  const file = path.resolve(root, 'js', rel); if (!fs.existsSync(file)) throw new Error(`Missing asset: ${rel}`);
  let size; try { size = execFileSync('ffprobe', ['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=p=0',file], { encoding:'utf8' }).trim().split(',').map(Number); } catch { throw new Error('ffprobe unavailable or failed'); }
  const probe = spawnSync('ffmpeg', ['-hide_banner','-v','info','-stream_loop','3','-i',file,'-vf','alphaextract,cropdetect=limit=1:round=1:reset=0','-frames:v','4','-f','null','-'], { encoding:'utf8' });
  const out = `${probe.stdout || ''}\n${probe.stderr || ''}`;
  if (probe.error) throw new Error(`ffmpeg unavailable: ${probe.error.message}`);
  const m = out.match(/crop=(\d+):(\d+):(\d+):(\d+)/g); if (!m) throw new Error(`No alpha bounds detected: ${rel}`);
  const [w,h,x,y] = m[m.length-1].slice(5).split(':').map(Number); if (!(w>0&&h>0&&x>=0&&y>=0&&x+w<=size[0]&&y+h<=size[1])) throw new Error(`Invalid bounds: ${rel}`);
  sizes.set(rel,{w:size[0],h:size[1]});
  return {x:+(x/size[0]*100).toFixed(2),y:+(y/size[1]*100).toFixed(2),w:+(w/size[0]*100).toFixed(2),h:+(h/size[1]*100).toFixed(2)};
}
const trims = Object.fromEntries([...art].map(a => [a, trim(a)]));
const adjust = (r,t,rel) => {
  const sz=sizes.get(rel), stage={w:4000,h:3000};
  const box={x:r.x/100*stage.w,y:r.y/100*stage.h,w:r.w/100*stage.w,h:r.h/100*stage.h};
  const scale=Math.min(box.w/sz.w,box.h/sz.h);
  const image={x:box.x+(box.w-sz.w*scale)/2,y:box.y+(box.h-sz.h*scale)/2};
  const next={
    x:(image.x+t.x/100*sz.w*scale)/stage.w*100,
    y:(image.y+t.y/100*sz.h*scale)/stage.h*100,
    w:(t.w/100*sz.w*scale)/stage.w*100,
    h:(t.h/100*sz.h*scale)/stage.h*100,
  };
  const rounded=Object.fromEntries(Object.entries(next).map(([key,value])=>[key,+value.toFixed(2)]));
  if (!(rounded.x>=0&&rounded.y>=0&&rounded.w>0&&rounded.h>0&&rounded.x+rounded.w<=100.01&&rounded.y+rounded.h<=100.01)) throw new Error(`Adjusted rect out of bounds: ${rel}`);
  return rounded;
};
const out = structuredClone(doc); out.version=2; out.coordinateSpace={...doc.coordinateSpace,rectMeaning:'visible-alpha-bounds'}; out.artTrims=trims;
for (const [l,s] of Object.entries(out.letters)) { for (const [id,r] of Object.entries(s.hunt.targets)) { const a=`../assets/papercraft/${l}-hunt/${id}.webp`; s.hunt.targets[id]=adjust(r,trims[a],a); s.completion.targets[id]=adjust(s.completion.targets[id],trims[a],a); } const d=distractors[l]; const letter=d==='ant'||d==='apple'||d==='alligator'?'a':d==='ball'||d==='boat'||d==='butterfly'?'b':'c'; const da=`../assets/papercraft/${letter}-hunt/${d}.webp`; s.hunt.distractor=adjust(s.hunt.distractor,trims[da],da); s.hunt.chest=adjust(s.hunt.chest,trims['../assets/papercraft/a-hunt/chest.webp'],'../assets/papercraft/a-hunt/chest.webp'); s.completion.chest=adjust(s.completion.chest,trims['../assets/papercraft/shared/open-chest.webp'],'../assets/papercraft/shared/open-chest.webp'); }
fs.writeFileSync(output, JSON.stringify(out,null,2)+'\n');
