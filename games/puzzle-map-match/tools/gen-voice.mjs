#!/usr/bin/env node

// Local-only Puzzle Explorer teacher-voice authoring. Network generation is
// opt-in (`--allow-lan` + QLOBE_STUDIO_URL); the server template binds the
// shared teacher reference, so it is intentionally not sent as a parameter.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const gameRoot = path.resolve(here, '..');
const repoRoot = path.resolve(gameRoot, '../..');
const linesPath = path.join(gameRoot, 'data/lines.json');
const voiceRef = path.join(repoRoot, 'shared/assets/refs/voice-teacher.wav');
const audioDir = path.join(gameRoot, 'assets/audio');
const recipesDir = path.join(gameRoot, 'assets/source/voice-recipes');
const qaDir = path.join(gameRoot, 'assets/source/voice-qa');
const dryRun = process.argv.includes('--dry-run');
const allowLan = process.argv.includes('--allow-lan');
const studio = process.env.QLOBE_STUDIO_URL;
const seeds = [7, 8, 9];
const threshold = 0.98;

const lines = JSON.parse(await readFile(linesPath, 'utf8'));
const plan = Object.entries(lines).map(([key, text]) => ({ key, text, mediaId: `pmm-jigsaw-${key}`, file: `${key}.m4a` }));
if (!plan.length || plan.some(({ key }) => !/^[a-z0-9][a-z0-9-]*$/.test(key))) {
  throw new Error('Voice line ids must be non-empty lowercase kebab-case basenames.');
}
if (dryRun) { console.log(`DRY RUN: ${plan.length} lines; no network calls or files written.`); process.exit(0); }
if (!allowLan) throw new Error('Refusing network generation: pass --allow-lan explicitly.');
if (!studio) throw new Error('Set QLOBE_STUDIO_URL to the approved local Studio host.');
let studioUrl;
try { studioUrl = new URL(studio); } catch { throw new Error(`Studio URL is invalid: ${studio}`); }
const host = studioUrl.hostname;
const privateHost = host === 'localhost' || host === '127.0.0.1'
  || /^10\.(?:\d{1,3}\.){2}\d{1,3}$/.test(host)
  || /^192\.168\.(?:\d{1,3}\.)\d{1,3}$/.test(host)
  || /^172\.(?:1[6-9]|2\d|3[01])\.(?:\d{1,3}\.)\d{1,3}$/.test(host);
if (!['http:', 'https:'].includes(studioUrl.protocol) || studioUrl.username || studioUrl.password || !privateHost) throw new Error(`Studio host is not a private/LAN address: ${studio}`);
const studioBase = studioUrl.origin;

const request = async (url, options = {}) => { const response = await fetch(url, options); const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(`${response.status}: ${body.error || response.statusText}`); return body; };
const mediaState = async (id) => {
  const folder = path.join(repoRoot, 'shared/media', id);
  try {
    const [recipe, transcript] = await Promise.all([
      readFile(path.join(folder, 'recipe.json'), 'utf8').then(JSON.parse),
      readFile(path.join(folder, 'qa-transcript.json'), 'utf8').then(JSON.parse),
    ]);
    const assetName = recipe.asset || `${id}.m4a`;
    if (typeof assetName !== 'string' || path.basename(assetName) !== assetName || !assetName.toLowerCase().endsWith('.m4a')) {
      throw new Error(`${id}: recipe asset must be one local .m4a basename`);
    }
    const asset = path.resolve(folder, assetName);
    if (path.dirname(asset) !== path.resolve(folder)) throw new Error(`${id}: recipe asset escapes its media folder`);
    await readFile(asset);
    return { folder, recipe, transcript, asset };
  } catch (error) {
    if (error.message?.includes('recipe asset')) throw error;
    return null;
  }
};
const duration = async (file) => { const { stdout } = await execFileAsync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file]); const n = Number(JSON.parse(stdout).format.duration); if (!(n > 0)) throw new Error(`invalid duration for ${file}`); return Number(n.toFixed(3)); };
const pass = (m, expectedText) => Boolean(m?.transcript?.match)
  && Number(m.transcript.ratio) >= threshold
  && m.transcript.intended === expectedText
  && m.recipe?.steps?.[0]?.text === expectedText
  && m.recipe?.refs?.voice === 'teacher';

// If Studio is configured with an alternate teacher file, require byte identity with the committed reference.
const localStatePath = path.join(repoRoot, 'tools/state/local.json');
try {
  const configured = JSON.parse(await readFile(localStatePath, 'utf8')).teacherVoicePath;
  if (configured) {
    const hash = async (file) => createHash('sha256').update(await readFile(file)).digest('hex');
    if (await hash(configured) !== await hash(voiceRef)) throw new Error('Configured teacherVoicePath differs from committed voice-teacher.wav');
  }
} catch (error) { if (error.code !== 'ENOENT') throw error; }
await readFile(voiceRef); // preflight: server template binds this approved reference.
const staging = path.join(audioDir, `.voice-staging-${process.pid}`);
await rm(staging, { recursive: true, force: true });
await Promise.all([mkdir(path.join(staging, 'audio'), { recursive: true }), mkdir(path.join(staging, 'recipes'), { recursive: true }), mkdir(path.join(staging, 'qa'), { recursive: true })]);
const manifest = {};
try {
  for (const [index, item] of plan.entries()) {
    process.stdout.write(`[${index + 1}/${plan.length}] ${item.key}\n`);
    let media = await mediaState(item.mediaId);
    if (!pass(media, item.text)) for (const seed of seeds) {
      const queued = await request(`${studioBase}/api/studio/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: 'character-voice-line', fields: { text: item.text }, params: { id: item.mediaId, seed, overwrite: true } }) });
      for (;;) { await new Promise((r) => setTimeout(r, 1500)); const { job } = await request(`${studioBase}/api/studio/jobs/${queued.jobId}`); if (job.status === 'completed') break; if (['failed', 'cancelled', 'canceled'].includes(job.status)) throw new Error(job.error || job.message || `job ${job.status}`); }
      media = await mediaState(item.mediaId); if (pass(media, item.text)) break;
    }
    if (!pass(media, item.text)) throw new Error(`${item.key}: transcript/provenance QA did not reach ${threshold}`);
    await request(`${studioBase}/api/studio/media/${item.mediaId}/accept`, { method: 'POST' });
    media = await mediaState(item.mediaId); if (!pass(media, item.text)) throw new Error(`${item.key}: accepted media failed QA/provenance`);
    await copyFile(media.asset, path.join(staging, 'audio', item.file));
    await copyFile(path.join(media.folder, 'recipe.json'), path.join(staging, 'recipes', `${item.key}.recipe.json`));
    await copyFile(path.join(media.folder, 'qa-transcript.json'), path.join(staging, 'qa', `${item.key}.json`));
    manifest[item.key] = { file: item.file, dur: await duration(path.join(staging, 'audio', item.file)) };
  }
  await writeFile(path.join(staging, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  await Promise.all([mkdir(audioDir, { recursive: true }), mkdir(recipesDir, { recursive: true }), mkdir(qaDir, { recursive: true })]);
  for (const item of plan) await rename(path.join(staging, 'audio', item.file), path.join(audioDir, item.file));
  await rename(path.join(staging, 'manifest.json'), path.join(audioDir, 'manifest.json'));
  for (const item of plan) { await rename(path.join(staging, 'recipes', `${item.key}.recipe.json`), path.join(recipesDir, `${item.key}.recipe.json`)); await rename(path.join(staging, 'qa', `${item.key}.json`), path.join(qaDir, `${item.key}.json`)); }
} finally { await rm(staging, { recursive: true, force: true }); }
console.log(`Wrote ${plan.length} clips and transcript QA.`);
