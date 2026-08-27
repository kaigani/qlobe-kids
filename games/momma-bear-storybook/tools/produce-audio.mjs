#!/usr/bin/env node

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(here, '..');
const configPath = path.join(gameRoot, 'config.json');
const sourceDir = path.join(gameRoot, 'assets', 'source', 'audio');
const audioDir = path.join(gameRoot, 'assets', 'audio');
const studio = (process.env.QLOBE_STUDIO_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const terminal = new Set(['completed', 'failed', 'cancelled', 'canceled']);

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok && response.status !== 409) throw new Error(`${response.status} ${body.error || response.statusText}`);
  return { status: response.status, ...body };
}
async function save(name, value) {
  await mkdir(sourceDir, { recursive: true });
  await writeFile(path.join(sourceDir, name), `${JSON.stringify(value, null, 2)}\n`);
}
function wordKey(token) {
  return String(token ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '').replace(/[^a-z0-9']/g, '');
}
function synthText(item, style = 'normal') {
  if (item.type !== 'word') return item.text;
  const word = item.text.replace(/[“”.,!?]/g, '').trim();
  const punctuation = style === 'emphatic' ? '!' : '.';
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}${punctuation}`;
}
async function localMedia(item) {
  const asset = path.join(audioDir, `${item.mediaId}.m4a`);
  const recipePath = `${asset}.recipe.json`;
  try {
    await readFile(asset);
    const recipe = JSON.parse(await readFile(recipePath, 'utf8'));
    const qa = recipe.qa || {};
    return { id: item.mediaId, asset: recipe.asset || path.basename(asset), recipe: { ...recipe, qa: { ...qa, transcript: qa.transcript || {} } }, qa: { status: qa.status, transcriptMatch: qa.transcript?.match, transcriptRatio: qa.transcript?.ratio } };
  } catch { return null; }
}
function expected(config) {
  const out = new Map();
  const add = (key, text, type, seed) => out.set(key, { key, text, type, seed, mediaId: `momma-bear-voice-${key.replace(/[^a-z0-9-]+/g, '-')}` });
  for (const story of config.stories || []) {
    for (const page of story.pages || []) {
      for (const token of page.line.split(/\s+/)) { const k = wordKey(token); if (k) add(`word:${k}`, token.replace(/[“”.,!?]/g, ''), 'word', 7); }
      add(page.lineKey, page.line, 'line', 8);
    }
    add(story.completionKey, story.completion, 'completion', 9);
  }
  for (const [key, text] of Object.entries(config.audio?.ui || {})) add(key, text, 'ui', 8);
  return [...out.values()];
}
async function queue(items) {
  const prior = await readFile(path.join(sourceDir, 'production-jobs.json'), 'utf8').then(JSON.parse).catch(() => ({}));
  const jobs = { generatedAt: new Date().toISOString(), studio, items: [] };
  for (const item of items) {
    const old = prior.items?.find((x) => x.key === item.key);
    if (old?.jobId) { jobs.items.push({ ...item, jobId: old.jobId, status: 'existing-ledger' }); continue; }
    const result = await request(`${studio}/api/studio/generate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'generate-voice', params: { id: item.mediaId, text: synthText(item), seed: item.seed } }) });
    jobs.items.push({ ...item, jobId: result.jobId || null, status: result.status === 409 ? 'existing-media' : 'queued' });
  }
  await save('production-jobs.json', jobs);
  console.log(JSON.stringify({ command: 'queue', expected: items.length, queued: jobs.items.filter((x) => x.status === 'queued').length, existing: jobs.items.filter((x) => x.status.includes('existing')).length }));
  return jobs;
}
async function snapshot(items) {
  const jobs = await request(`${studio}/api/studio/jobs`).then((x) => x.jobs || []);
  const media = await request(`${studio}/api/studio/media`).then((x) => x.media || []);
  // Studio lists newest jobs first. Preserve the newest attempt for a media id
  // so a retry cannot be shadowed by its older completed job.
  const byJob = new Map();
  for (const job of [...jobs].sort((a, b) => Number(b.created || 0) - Number(a.created || 0))) {
    if (job.mediaId && !byJob.has(job.mediaId)) byJob.set(job.mediaId, job);
  }
  const byMedia = new Map(media.map((m) => [m.id, m]));
  const local = await Promise.all(items.map(localMedia));
  const clips = items.map((item, index) => { const assigned = byMedia.get(item.mediaId) || local[index]; return { ...item, job: byJob.get(item.mediaId) || null, media: assigned, status: byJob.get(item.mediaId)?.status || (assigned ? 'completed' : 'missing') }; });
  const counts = Object.fromEntries(['queued', 'running', 'completed', 'failed', 'missing'].map((s) => [s, clips.filter((x) => x.status === s).length]));
  const qa = clips.reduce((out, clip) => { const verdict = transcriptVerdict(clip.item || clip); out[verdict] += 1; return out; }, { native: 0, contextual: 0, equivalence: 0, hardFailure: 0, pending: 0 });
  const result = { generatedAt: new Date().toISOString(), expected: clips.length, counts, transcriptQA: qa, clips };
  await save('production-status.json', result);
  await save('qa-overrides.json', {
    generatedAt: result.generatedAt,
    policy: 'Native means normalized exact transcript. Token-wise equivalences are limited to one/1, to/two/2, by/buy/bye, sea/see, whirr/whir/where, and article a/ay/hey; the same explicit token rule may occur inside a longer otherwise-exact line. Contextual verification is limited to timestamped hay from a source line whose transcript contains hay.',
    overrides: clips.filter((clip) => transcriptVerdict(clip) === 'equivalence').map((clip) => ({ key: clip.key, expected: clip.media?.recipe?.qa?.transcript?.intended || clip.text, heard: clip.media?.recipe?.qa?.transcript?.heard || null, rule: equivalenceRule(clip) })),
    contextual: clips.filter((clip) => transcriptVerdict(clip) === 'contextual').map((clip) => ({ key: clip.key, expected: clip.text, rule: contextualRule(clip), sourceHeard: clip.media?.recipe?.qa?.sourceTranscript?.heard || null })),
  });
  console.log(JSON.stringify({
    command: 'status', expected: clips.length, counts, transcriptQA: qa,
    hardFailureKeys: clips.filter((clip) => transcriptVerdict(clip) === 'hardFailure').map((clip) => clip.key),
  }));
  return result;
}
function transcript(clip) { return clip.media?.recipe?.qa?.transcript || {}; }
function normalizedTranscript(value) {
  return String(value ?? '').toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9']+/g, ' ').trim().replace(/\s+/g, ' ');
}
function equivalenceRule(clip) {
  const expectedTokens = normalizedTranscript(transcript(clip).intended || clip.text).split(' ').filter(Boolean);
  const heardTokens = normalizedTranscript(transcript(clip).heard).split(' ').filter(Boolean);
  if (!expectedTokens.length || expectedTokens.length !== heardTokens.length) return null;
  const rules = [];
  for (let index = 0; index < expectedTokens.length; index += 1) {
    const expectedWord = expectedTokens[index]; const heardWord = heardTokens[index];
    if (expectedWord === heardWord) continue;
    if (expectedWord === 'one' && heardWord === '1' || expectedWord === 'to' && ['two', '2'].includes(heardWord) || expectedWord === 'by' && ['buy', 'bye'].includes(heardWord) || expectedWord === 'sea' && heardWord === 'see') rules.push(`${expectedWord}/${heardWord}`);
    else if (['whirr', 'whir'].includes(expectedWord) && heardWord === 'where') rules.push(`${expectedWord}/where`);
    else if (expectedWord === 'a' && ['ay', 'hey'].includes(heardWord)) rules.push(`a/${heardWord}`);
    else return null;
  }
  return rules.length ? [...new Set(rules)].join(', ') : null;
}
function contextualRule(clip) {
  // An isolated homophone cannot resolve spelling from audio alone. The `hay`
  // clip is accepted only when its timestamped source line contains the exact
  // story word and a context-aware base decode returns that exact orthography.
  // The unprompted `hey` diagnostic remains recorded in the recipe and is not
  // added to the equivalence allow-list.
  if (clip.type !== 'word' || wordKey(clip.text) !== 'hay') return null;
  const qa = clip.media?.recipe?.qa || {};
  const contextual = qa.contextualTranscript || {};
  const source = qa.sourceTranscript || {};
  const exact = normalizedTranscript(contextual.intended) === 'hay'
    && normalizedTranscript(contextual.heard) === 'hay'
    && contextual.match === true;
  const sourceHasHay = normalizedTranscript(source.heard).split(' ').includes('hay');
  return exact && sourceHasHay ? 'timestamped-source-line/hay' : null;
}
function transcriptVerdict(clip) {
  const media = clip.media; if (!media || !['review', 'accepted'].includes(media.qa?.status)) return 'pending';
  const intended = transcript(clip).intended || clip.text;
  if (normalizedTranscript(intended) === normalizedTranscript(transcript(clip).heard)) return 'native';
  if (contextualRule(clip)) return 'contextual';
  return equivalenceRule(clip) ? 'equivalence' : 'hardFailure';
}
function qaPass(media, clip) { return ['native', 'contextual', 'equivalence'].includes(transcriptVerdict({ media, ...clip })); }
async function promote(items) {
  await mkdir(audioDir, { recursive: true });
  const manifest = {}; const lines = {}; let promoted = 0; const blocked = [];
  for (const item of items) {
    const local = await localMedia(item);
    const localPasses = Boolean(local && qaPass(local, item));
    let media = localPasses ? local : null;
    if (!media) media = (await request(`${studio}/api/studio/media/${item.mediaId}`)).media;
    if (!qaPass(media, item)) { blocked.push(item.key); continue; }
    if (localPasses) { manifest[item.key] = { file: local.asset, text: item.text }; lines[item.key] = item.text; promoted += 1; continue; }
    const accepted = await request(`${studio}/api/studio/media/${item.mediaId}/accept`, { method: 'POST' });
    const recipe = accepted.media?.recipe || media.recipe || {};
    const asset = recipe.asset || media.asset;
    // Assignment intentionally refuses to overwrite shipped assets. Preserve a
    // rejected local take, then leave the exact destination clear for Studio.
    // If assignment fails, restore both files so promotion is transactional.
    const existingAsset = path.join(audioDir, path.basename(asset));
    const existingSidecar = `${existingAsset}.recipe.json`;
    const replacementDir = path.join(sourceDir, 'replaced-runtime');
    const backupAsset = path.join(replacementDir, path.basename(existingAsset));
    const backupSidecar = path.join(replacementDir, path.basename(existingSidecar));
    let backedUpAsset = false; let backedUpSidecar = false;
    if (local) {
      await mkdir(replacementDir, { recursive: true });
      try { await rename(existingAsset, backupAsset); backedUpAsset = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
      try { await rename(existingSidecar, backupSidecar); backedUpSidecar = true; } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    let assigned;
    try {
      assigned = await request(`${studio}/api/studio/media/${item.mediaId}/assign`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ dest: 'games/momma-bear-storybook/assets/audio' }) });
      if (!assigned.ok) throw new Error(`assignment failed for ${item.key}: ${assigned.error || assigned.status}`);
    } catch (error) {
      if (backedUpAsset) await rename(backupAsset, existingAsset);
      if (backedUpSidecar) await rename(backupSidecar, existingSidecar);
      throw error;
    }
    const file = path.basename(assigned.dest || asset);
    manifest[item.key] = { file, text: item.text };
    lines[item.key] = item.text; promoted += 1;
  }
  await writeFile(path.join(audioDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(path.join(audioDir, 'lines.json'), `${JSON.stringify(lines, null, 2)}\n`);
  console.log(JSON.stringify({ command: 'promote', promoted, blocked: blocked.length, blockedKeys: blocked }));
  if (blocked.length) process.exitCode = 2;
}
async function retry(items) {
  const jobs = await request(`${studio}/api/studio/jobs`).then((x) => x.jobs || []);
  if (items.some((item) => jobs.some((job) => job.mediaId === item.mediaId && ['queued', 'running'].includes(job.status)))) {
    throw new Error('retry refused: expected jobs are still queued or running');
  }
  const media = await request(`${studio}/api/studio/media`).then((x) => x.media || []); const byId = new Map(media.map((m) => [m.id, m])); const local = await Promise.all(items.map(localMedia));
  const requestedKeys = new Set(process.argv.slice(5));
  const failures = items.filter((item, index) => (
    (!requestedKeys.size || requestedKeys.has(item.key))
    && transcriptVerdict({ ...item, media: byId.get(item.mediaId) || local[index] }) === 'hardFailure'
  ));
  if (requestedKeys.size) {
    const unknown = [...requestedKeys].filter((key) => !items.some((item) => item.key === key));
    if (unknown.length) throw new Error(`unknown retry keys: ${unknown.join(', ')}`);
  }
  const seedArg = process.argv[3] ? Number(process.argv[3]) : null;
  if (seedArg !== null && (!Number.isInteger(seedArg) || seedArg < 0)) throw new Error('retry seed must be a non-negative integer');
  const style = process.argv[4] || 'normal';
  if (!['normal', 'emphatic'].includes(style)) throw new Error('retry style must be normal or emphatic');
  const results = [];
  for (const item of failures) {
    const seed = seedArg ?? item.seed + 1;
    const response = await request(`${studio}/api/studio/generate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'generate-voice',
        params: { id: item.mediaId, text: synthText(item, style), seed },
        overwrite: true,
        interactive: true,
      }),
    });
    const jobId = response.jobId;
    if (!jobId) throw new Error(`retry did not return a job id for ${item.key}`);
    let state = 'queued';
    const started = Date.now();
    while (!terminal.has(state) && Date.now() - started < 12 * 60 * 1000) {
      await sleep(2000);
      const current = await request(`${studio}/api/studio/jobs/${jobId}`);
      state = current.job?.status || current.status || state;
    }
    if (!terminal.has(state)) state = 'timeout';
    let indexed = false;
    if (state === 'completed') {
      const indexStarted = Date.now();
      while (!indexed && Date.now() - indexStarted < 30000) {
        try { indexed = Boolean((await request(`${studio}/api/studio/media/${item.mediaId}`)).media); }
        catch { await sleep(1000); }
      }
    }
    results.push({ key: item.key, mediaId: item.mediaId, jobId, status: state, indexed, seed, style });
  }
  console.log(JSON.stringify({ command: 'retry', retried: results.length, results }));
}
const config = JSON.parse(await readFile(configPath, 'utf8')); const items = expected(config); const command = process.argv[2] || 'status';
if (command === 'queue') await queue(items);
else if (command === 'status') { const result = await snapshot(items); if (result.counts.failed || (!result.counts.queued && !result.counts.running && result.transcriptQA.hardFailure)) process.exitCode = 2; }
else if (command === 'promote') await promote(items);
else if (command === 'retry') await retry(items);
else if (command === 'all') { await queue(items); const started = Date.now(); let last; for (;;) { last = await snapshot(items); if (last.counts.failed || Date.now() - started > 30 * 60 * 1000) { process.exitCode = 2; break; } if (last.counts.completed === items.length) break; await sleep(3000); } if (!process.exitCode && last?.transcriptQA.hardFailure) process.exitCode = 2; if (!process.exitCode) await promote(items); }
else throw new Error(`unknown command: ${command}`);
