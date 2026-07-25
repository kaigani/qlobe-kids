// validators/recipe.mjs — qlobe-recipe v1 (spec §7.6, Phase 5). The machine-
// readable provenance sidecar every generation job writes for a media object in
// the shared/media/ unassigned bucket (spec §5.1).
//
// Checks: schema shape; id ↔ directory agreement; symbolic-ref discipline (NO
// absolute paths, NO host/IP anywhere in the recipe — the GenAI host is env-only,
// named refs are symbolic); steps[] complete enough for Regenerate to re-enqueue;
// derivedFrom targets exist; QA block coherent for the kind.
//
// An empty (or absent) bucket is a clean pass — subjects() returns [].
//
// Severity: `error` = a real contract break (bad shape, host/abs path leak, a
// dangling derivedFrom, steps that cannot regenerate). `warn` = soft data issues.

import { listSubdirs, isFile, isDir, tryReadJSON, isKebabId } from '../lib.mjs';

const MEDIA_ROOT = 'shared/media';
const TEMPLATE_REGISTRY = 'shared/data/generate-templates.json';
const KINDS = new Set(['image', 'voice']);
const QA_STATUSES = new Set(['review', 'accepted', 'failed-qa']);
const IMAGE_WORKFLOWS = new Set([
  'krea2-turbo-t2i', 'flux2-t2i', 'flux2-klein-edit',
  'ideogram4-t2i', 'z-image-base-t2i', 'qwen-image-edit', 'qwen-image-layered',
]);

const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
const URL_RE = /https?:\/\//i;

// Walk every string value in the recipe; flag absolute filesystem paths, IPs, and
// URLs (the host must never be serialized; refs are symbolic like "shared:...").
function scanStrings(value, path, onLeak) {
  if (typeof value === 'string') {
    if (value.startsWith('/') || /^[A-Za-z]:[\\/]/.test(value)) onLeak(path, `absolute path ${JSON.stringify(value)}`);
    if (IP_RE.test(value)) onLeak(path, `IP-like host ${JSON.stringify(value)}`);
    if (URL_RE.test(value)) onLeak(path, `URL ${JSON.stringify(value)}`);
  } else if (Array.isArray(value)) {
    value.forEach((v, i) => scanStrings(v, `${path}[${i}]`, onLeak));
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) scanStrings(v, path ? `${path}.${k}` : k, onLeak);
  }
}

// The qlobe-generate-templates registry (§7.7), read once per sweep. A recipe
// written from a template records which one it came from; the template block is
// the only link back, because the expanded prompt is frozen into steps[].
let templateRegistry;
function loadTemplateRegistry() {
  if (templateRegistry === undefined) templateRegistry = tryReadJSON(TEMPLATE_REGISTRY);
  return templateRegistry;
}

function subjects() {
  if (!isDir(MEDIA_ROOT)) return [];
  return listSubdirs(MEDIA_ROOT)
    .filter((id) => isKebabId(id) && isFile(`${MEDIA_ROOT}/${id}/recipe.json`))
    .map((id) => ({ id, document: `${MEDIA_ROOT}/${id}/recipe.json` }));
}

function validate(subject, r) {
  const doc = tryReadJSON(subject.document);
  if (!doc || typeof doc !== 'object') { r.error(`${subject.document} is missing or not valid JSON`); return; }

  if (doc.format !== 'qlobe-recipe') r.error(`format must be "qlobe-recipe" (found ${JSON.stringify(doc.format)})`);
  if (doc.formatVersion !== 1) r.warn(`formatVersion should be 1 (found ${JSON.stringify(doc.formatVersion)})`);
  if (doc.id !== subject.id) r.error(`recipe id ${JSON.stringify(doc.id)} must match its directory ${JSON.stringify(subject.id)}`);
  if (!KINDS.has(doc.kind)) r.error(`kind must be one of image|voice (found ${JSON.stringify(doc.kind)})`);
  if (!doc.created) r.warn('recipe has no created date');

  // --- symbolic-ref discipline: no host, no absolute paths anywhere ---
  scanStrings(doc, '', (where, msg) => r.error(`host/path leak at ${where || '(root)'}: ${msg}`));
  const refs = doc.refs && typeof doc.refs === 'object' ? doc.refs : {};
  for (const [k, v] of Object.entries(refs)) {
    // shared:<path> (a committed asset) and media:<id> (a staged shared/media/
    // object picked through the gallery chooser) are both symbolic — the machine
    // path is never serialized. Anything else carrying a colon is suspect.
    if (typeof v === 'string' && v.includes(':') && !v.startsWith('shared:') && !v.startsWith('media:') && k === 'style') {
      r.warn(`refs.style ${JSON.stringify(v)} is not a symbolic shared:/media: ref`);
    }
  }

  // --- steps[] must be sufficient for Regenerate ---
  const steps = Array.isArray(doc.steps) ? doc.steps : null;
  if (!steps || !steps.length) { r.error('steps[] must be a non-empty array (Regenerate re-enqueues it)'); }
  else {
    steps.forEach((s, i) => {
      if (!s || typeof s !== 'object') { r.error(`steps[${i}] must be an object`); return; }
      if (!s.workflow && !s.op) r.error(`steps[${i}] needs a workflow or an op`);
      if (s.workflow && !IMAGE_WORKFLOWS.has(s.workflow) && s.workflow !== 'qwen3-tts-voiceclone')
        r.warn(`steps[${i}] workflow ${JSON.stringify(s.workflow)} is not in the known allow-list`);
    });
    if (doc.kind === 'image') {
      const gen = steps.find((s) => s.workflow && s.workflow !== 'qwen-image-layered');
      if (!gen) r.error('an image recipe needs a generation step (a t2i/edit workflow)');
      else if (!gen.prompt) r.error('the image generation step needs a prompt to regenerate');
    }
    if (doc.kind === 'voice') {
      const gen = steps.find((s) => s.workflow === 'qwen3-tts-voiceclone');
      if (!gen) r.error('a voice recipe needs a qwen3-tts-voiceclone step');
      else if (!gen.text) r.error('the voice step needs its text to regenerate');
    }
  }

  // --- template provenance (§7.7), when the job came from the registry ---
  if (doc.template != null) {
    if (typeof doc.template !== 'object' || Array.isArray(doc.template)) {
      r.error('recipe.template must be an object {id, style, fields}');
    } else {
      const registry = loadTemplateRegistry();
      const templates = Array.isArray(registry?.templates) ? registry.templates : null;
      const found = templates ? templates.find((t) => t && t.id === doc.template.id) : null;
      if (!templates) r.warn(`recipe names template ${JSON.stringify(doc.template.id)} but the registry could not be read`);
      else if (!found) r.error(`recipe.template.id ${JSON.stringify(doc.template.id)} is not in ${TEMPLATE_REGISTRY}`);
      if (doc.template.style != null && registry?.styles && !registry.styles[doc.template.style])
        r.warn(`recipe.template.style ${JSON.stringify(doc.template.style)} is not a declared style`);
      if (doc.template.fields != null && (typeof doc.template.fields !== 'object' || Array.isArray(doc.template.fields)))
        r.error('recipe.template.fields must be an object of the values the template was filled with');
    }
  }

  // --- derivedFrom targets exist ---
  if (doc.derivedFrom != null) {
    if (!isKebabId(doc.derivedFrom)) r.error(`derivedFrom ${JSON.stringify(doc.derivedFrom)} is not a kebab media id`);
    else if (!isFile(`${MEDIA_ROOT}/${doc.derivedFrom}/recipe.json`))
      r.error(`derivedFrom target media ${JSON.stringify(doc.derivedFrom)} does not exist in the bucket`);
  }

  // --- QA block coherence ---
  const qa = doc.qa && typeof doc.qa === 'object' ? doc.qa : null;
  if (!qa) { r.error('recipe has no qa block'); return; }
  if (!QA_STATUSES.has(qa.status)) r.error(`qa.status must be review|accepted|failed-qa (found ${JSON.stringify(qa.status)})`);
  if (doc.kind === 'voice') {
    if (!qa.transcript || typeof qa.transcript !== 'object') r.warn('voice recipe qa should record the transcript comparison');
  }
  // A passed image cutout (a chain with a layered extract step) should carry alpha stats.
  const isCutout = Array.isArray(steps) && steps.some((s) => s.workflow === 'qwen-image-layered');
  if (doc.kind === 'image' && isCutout && qa.status !== 'failed-qa') {
    if (!qa.alpha || typeof qa.alpha !== 'object' || typeof qa.alpha.partialPct !== 'number')
      r.warn('cutout recipe qa should record the alpha histogram (qa.alpha.partialPct)');
  }
  // A recipe with an accepted/review status must actually have a shippable asset named.
  if (qa.status !== 'failed-qa' && doc.asset && !isFile(`${MEDIA_ROOT}/${subject.id}/${doc.asset}`)) {
    r.error(`recipe.asset ${JSON.stringify(doc.asset)} is missing on disk`);
  }
}

export default { target: 'recipe', aliases: ['recipes', 'media'], subjects, validate };
