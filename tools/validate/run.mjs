#!/usr/bin/env node
// tools/validate/run.mjs — the QLOBE Studio v2 validator runner (§8.1).
//
//   node tools/validate/run.mjs [target] [--json] [--assets] [--audio]
//
// target = a format name (character, voice-pack, pose-actor, prop-pack,
//   scene-pack, music-sync, story-pack, studio-projects, registry,
//   generate-templates) or one of their aliases, OR a game id / character id /
//   object id, OR omitted for a full sweep.
//
// Output: grouped human findings + a summary, or a machine report with --json
// (consumed by POST /api/studio/validate → the Production dashboard). Exit code
// is 1 when any ERROR was found, else 0. WARN never fails the build: pre-existing
// data issues across the 102 games are reported truthfully as findings, not
// treated as regressions, and game data is never edited to make a check pass.

import { Reporter } from './lib.mjs';
import character from './validators/character.mjs';
import voicePack from './validators/voice-pack.mjs';
import poseActor from './validators/pose-actor.mjs';
import propPack from './validators/prop-pack.mjs';
import scenePack from './validators/scene-pack.mjs';
import musicSync from './validators/music-sync.mjs';
import storyPack from './validators/story-pack.mjs';
import studioProjects from './validators/studio-projects.mjs';
import registry from './validators/registry.mjs';
import recipe from './validators/recipe.mjs';
import generateTemplates from './validators/generate-templates.mjs';

const VALIDATORS = [
  character, voicePack, poseActor, propPack, scenePack, musicSync, storyPack, studioProjects, registry, recipe,
  generateTemplates,
];

const args = process.argv.slice(2);
const asJson = args.includes('--json');
const target = args.find((a) => !a.startsWith('--')) || null;

const matchesName = (v) => v.target === target || (v.aliases || []).includes(target);
const matchesId = (s) => s.id === target || s.gameId === target || s.project === target || s.characterId === target;

function safeSubjects(v) {
  try { return v.subjects() || []; } catch (e) { return { __error: e.message }; }
}

// Build the (validator, subject) work list for this target.
const reporter = new Reporter();
const byName = target ? VALIDATORS.filter(matchesName) : VALIDATORS;
let work = [];
let selectionEmpty = false;

if (!target || byName.length) {
  for (const v of byName) {
    const subs = safeSubjects(v);
    if (subs.__error) { reporter.scope(v.target, '(discovery)').error(`could not enumerate subjects: ${subs.__error}`); continue; }
    for (const s of subs) work.push([v, s]);
  }
} else {
  // Treat the target as an id across every validator.
  for (const v of VALIDATORS) {
    const subs = safeSubjects(v);
    if (subs.__error) continue;
    for (const s of subs) if (matchesId(s)) work.push([v, s]);
  }
  selectionEmpty = work.length === 0;
}

for (const [v, s] of work) {
  const r = reporter.scope(v.target, s.id);
  try { v.validate(s, r); } catch (e) { r.error(`validator crashed: ${e.stack || e.message}`); }
}

const errors = reporter.errors.length;
const warns = reporter.warns.length;
const infos = reporter.infos.length;
const subjectsRun = new Set(work.map(([v, s]) => `${v.target}:${s.id}`)).size;

if (asJson) {
  console.log(JSON.stringify({
    ok: errors === 0,
    target: target || '(full sweep)',
    subjectsRun,
    counts: { error: errors, warn: warns, info: infos },
    findings: reporter.findings,
  }, null, 2));
} else {
  if (selectionEmpty) console.log(`No validator subjects match target "${target}".`);
  // Group by format:id for readable output.
  const groups = new Map();
  for (const f of reporter.findings) {
    const key = `${f.format} · ${f.id}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const mark = { error: 'FAIL', warn: 'WARN', info: 'info' };
  for (const [key, findings] of groups) {
    const shown = findings.filter((f) => f.severity !== 'info');
    if (!shown.length) continue; // suppress info-only groups from the human sweep
    console.log(`\n${key}`);
    for (const f of shown) console.log(`  ${mark[f.severity]}  ${f.message}`);
  }
  console.log(`\nvalidate ${target ? `[${target}]` : '(full sweep)'}: ${subjectsRun} subject(s) · ${errors} error(s) · ${warns} warning(s)`);
  console.log(errors ? 'validation found errors.' : 'no errors.');
}

process.exit(errors ? 1 : 0);
