#!/usr/bin/env node
/** Exhaustive content and production-asset validation for Story Stones v2. */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const game=path.join(root,'games/story-stones');
const pack=JSON.parse(fs.readFileSync(path.join(game,'story-pack.json'),'utf8'));
const args=new Set(process.argv.slice(2));
const errors=[],warnings=[];
const fail=(message)=>errors.push(message);
const stones=pack.stones,byId=Object.fromEntries(stones.map((stone)=>[stone.id,stone]));
const entries=Object.entries(pack.stories||{});
const combinationId=(ids)=>{if(!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3)throw new Error('A story needs three different stones.');return [...ids].sort().join('--');};
const resolveStory=(value,ids)=>{
  const key=combinationId(ids),recipe=value.stories?.[key];if(!recipe)throw new Error(`no story for ${key}`);
  if(combinationId(recipe.stoneIds)!==key||combinationId(recipe.castOrder)!==key)throw new Error(`invalid recipe for ${key}`);
  return {id:recipe.id,castOrder:[...recipe.castOrder],phases:recipe.beats,backdrop:recipe.setting.backdrop};
};

if(pack.formatVersion!==2)fail(`formatVersion must be 2, found ${pack.formatVersion}`);
if(entries.length!==220)fail(`expected 220 stories, found ${entries.length}`);
const labels=new Set(),paths=new Set(),prompts=new Set(),texts=new Set(),narrators=new Set();
for(const [key,story] of entries){
  try{if(combinationId(story.stoneIds)!==key)fail(`${key}: stoneIds mismatch`);if(combinationId(story.castOrder)!==key)fail(`${key}: castOrder mismatch`);}catch(error){fail(`${key}: ${error.message}`);}
  if(story.id!==key)fail(`${key}: id mismatch`);
  if(story.status!=='approved')fail(`${key}: is not approved`);
  if(!story.setting?.label||labels.has(story.setting.label))fail(`${key}: missing or duplicate setting label`);labels.add(story.setting?.label);
  if(!story.setting?.backdrop||paths.has(story.setting.backdrop))fail(`${key}: missing or duplicate backdrop path`);paths.add(story.setting?.backdrop);
  if(!story.setting?.prompt||prompts.has(story.setting.prompt))fail(`${key}: missing or duplicate Krea prompt`);prompts.add(story.setting?.prompt);
  if(story.setting?.workflow!=='krea2-turbo-t2i'||story.setting?.width!==1344||story.setting?.height!==768||story.setting?.steps!==8||story.setting?.cfg!==1)fail(`${key}: Krea recipe mismatch`);
  if(story.beats?.length!==3)fail(`${key}: expected three beats`);
  const ids=(story.beats||[]).map((beat)=>beat.id).join(',');if(ids!=='beginning,complication,resolution')fail(`${key}: invalid beat order ${ids}`);
  const allText=(story.beats||[]).map((beat)=>beat.text).join(' '),words=allText.trim().split(/\s+/).length;
  if(words<45||words>90)fail(`${key}: ${words} words is outside 45–90`);
  if(texts.has(allText))fail(`${key}: duplicate complete story text`);texts.add(allText);
  for(const id of story.stoneIds){if(!allText.includes(byId[id].label))fail(`${key}: does not mention ${byId[id].label}`);}
  for(const stone of stones){if(!story.stoneIds.includes(stone.id)&&allText.includes(stone.label))fail(`${key}: mentions unselected ${stone.label}`);}
  for(const beat of story.beats||[]){if(!beat.text||!beat.narrator)fail(`${key}: incomplete beat`);if(narrators.has(beat.narrator))fail(`${key}: duplicate narrator ${beat.narrator}`);narrators.add(beat.narrator);}
}
if(narrators.size!==660)fail(`expected 660 narrator keys, found ${narrators.size}`);

let combinations=0,permutations=0;
for(let a=0;a<stones.length;a+=1)for(let b=a+1;b<stones.length;b+=1)for(let c=b+1;c<stones.length;c+=1){
  combinations+=1;const ids=[stones[a].id,stones[b].id,stones[c].id];
  const variants=[[ids[0],ids[1],ids[2]],[ids[0],ids[2],ids[1]],[ids[1],ids[0],ids[2]],[ids[1],ids[2],ids[0]],[ids[2],ids[0],ids[1]],[ids[2],ids[1],ids[0]]];
  const resolved=variants.map((variant)=>{permutations+=1;try{return resolveStory(pack,variant);}catch(error){fail(`${variant.join(',')}: ${error.message}`);return null;}}).filter(Boolean);
  if(new Set(resolved.map((item)=>item.id)).size!==1)fail(`${ids.join(',')}: permutations resolve differently`);
  if(resolved.some((item)=>item.castOrder.join(',')!==resolved[0].castOrder.join(',')))fail(`${ids.join(',')}: cast order changes by permutation`);
}
if(combinations!==220||permutations!==1320)fail(`resolver coverage was ${combinations} combinations / ${permutations} permutations`);

if(args.has('--assets')){
  const hashes=new Map(),perceptual=[];
  for(const [key,story] of entries){
    const filename=path.join(game,story.setting.backdrop);
    if(!fs.existsSync(filename)){fail(`${key}: missing ${story.setting.backdrop}`);continue;}
    const data=fs.readFileSync(filename),hash=crypto.createHash('sha256').update(data).digest('hex');
    if(hashes.has(hash))fail(`${key}: exact duplicate art with ${hashes.get(hash)}`);hashes.set(hash,key);
    const probe=spawnSync('/usr/local/bin/ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','csv=s=x:p=0',filename],{encoding:'utf8'});
    if(probe.status!==0||probe.stdout.trim()!=='1344x768')fail(`${key}: scene is not a decodable 1344x768 image`);
    const sample=spawnSync('/usr/local/bin/ffmpeg',['-v','error','-i',filename,'-vf','scale=16:16,format=rgb24','-f','rawvideo','pipe:1'],{maxBuffer:1024*1024});
    if(sample.status===0&&sample.stdout.length===768)perceptual.push([key,sample.stdout]);
    else fail(`${key}: could not calculate perceptual hash`);
    if(data.length>700*1024)warnings.push(`${key}: scene exceeds 700 KiB`);
  }
  for(let a=0;a<perceptual.length;a+=1)for(let b=a+1;b<perceptual.length;b+=1){let squared=0;for(let i=0;i<768;i+=1){const delta=perceptual[a][1][i]-perceptual[b][1][i];squared+=delta*delta;}const rms=Math.sqrt(squared/768);if(rms<8)warnings.push(`${perceptual[a][0]} and ${perceptual[b][0]} are visually near-duplicate (thumbnail RMS ${rms.toFixed(1)})`);}
}

if(args.has('--audio')){
  const audio=path.join(game,'assets/audio');
  const manifest=JSON.parse(fs.readFileSync(path.join(audio,'manifest.json'),'utf8'));
  const expected=new Map();
  for(const story of Object.values(pack.stories))for(const beat of story.beats)expected.set(beat.narrator,beat.text);
  for(const [key,text] of expected){
    const item=manifest[key],hash=crypto.createHash('sha256').update(text).digest('hex').slice(0,16);
    if(!item)fail(`audio: missing ${key}`);else{
      if(item.textHash!==hash)fail(`audio: stale text hash for ${key}`);
      if(!fs.existsSync(path.join(audio,item.file))||!(item.dur>.25))fail(`audio: invalid file for ${key}`);
    }
  }
  for(const story of Object.values(pack.stories)){
    const total=story.beats.reduce((sum,beat)=>sum+(manifest[beat.narrator]?.dur||0),0);
    if(total&& (total<25||total>35))warnings.push(`${story.id}: narration is ${total.toFixed(1)}s (target 25–35s)`);
    if(total&& (total<20||total>42))fail(`${story.id}: narration duration ${total.toFixed(1)}s is outside the hard 20–42s limit`);
  }
}

console.log(`Story Stones v2: ${entries.length} stories · ${narrators.size} beats · ${combinations} combinations · ${permutations} permutations`);
for(const warning of warnings)console.warn(`WARN ${warning}`);
if(errors.length){for(const error of errors.slice(0,80))console.error(`FAIL ${error}`);console.error(`${errors.length} validation failure(s)`);process.exit(1);}
console.log('PASS');
