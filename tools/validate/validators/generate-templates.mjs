// validators/generate-templates.mjs — qlobe-generate-templates v1 (spec §7.7,
// Phase 6). The committed registry of generation recipes at
// shared/data/generate-templates.json: a styles{} map of art worlds plus a
// templates[] list of prompt + reference + workflow bundles, harvested verbatim
// from proven production runs.
//
// The registry is the *only* place a prompt lives. The server expands a template
// at enqueue (slot substitution + variant merge) and freezes the result into the
// media object's qlobe-recipe (§7.6), so a bad registry is a bad generation for
// every future run — hence this validator is strict about the things expansion
// cannot recover from: an unresolvable slot, a missing style, a style ref that is
// not on disk, a workflow the server will refuse.
//
// Checks: identity; kebab + unique template ids; kind allow-list; workflow
// allow-list; scanStrings host/abs-path/URL sweep over the whole document (the
// corpus this was harvested from lives outside the repo — no path may follow it
// in); every {slot} in a base or variant prompt resolves to a declared field or
// {style.suffix}; every style a template lists exists, and a `proven` style
// carries a suffix; `shared:` refs resolve under shared/assets/; defaultStyle is
// one of the template's own styles; a refSlot's `gallery` entries are `media`
// or `shared:<dir>` naming a directory that exists under shared/assets/, and
// its `default` resolves under the same `shared:` rule `refs` does.
//
// Severity: `error` = a contract break that would produce a wrong or failed
// generation (bad shape, leaked path/host, dangling slot/style, missing ref
// file, unknown workflow). `warn` = a soft issue — a bare named styleRefs key
// (machine-local by design, unverifiable from the repo), an unproven style, a
// missing example, provenance note or one-line description.

import { readJSON, isFile, isDir, isKebabId } from '../lib.mjs';

const DOCUMENT = 'shared/data/generate-templates.json';

const KINDS = new Set(['generate-image', 'cutout-chain', 'generate-voice']);
const STYLE_STATUSES = new Set(['proven', 'unproven']);
const FIELD_TYPES = new Set(['text', 'textarea', 'select', 'number']);
// The cutout finalize sizes the server keys off (CUTOUT_TARGET_SIZES).
const CUTOUT_TARGETS = new Set(['character', 'object', 'prop']);
// Mirrors recipe.mjs IMAGE_WORKFLOWS — the same allow-list a written recipe is
// held to, so a template can never enqueue a workflow its recipe would fail on.
const IMAGE_WORKFLOWS = new Set([
  'krea2-turbo-t2i', 'flux2-t2i', 'flux2-klein-edit',
  'ideogram4-t2i', 'z-image-base-t2i', 'qwen-image-edit', 'qwen-image-layered',
]);
// Workflows that consume an input reference image — they cannot run without one,
// so a template on an edit workflow must be able to name a `style` ref somehow.
const EDIT_WORKFLOWS = new Set(['flux2-klein-edit', 'qwen-image-edit']);
const VOICE_WORKFLOW = 'qwen3-tts-voiceclone';
// Where a run-time-supplied reference comes from.
const REF_SOURCES = new Set(['media', 'upload']);

// Slots the expander substitutes from the style rather than from a field.
const STYLE_SLOTS = new Set(['style.suffix']);
const SLOT_RE = /\{([^{}]*)\}/g;

const IP_RE = /\b\d{1,3}(?:\.\d{1,3}){3}\b/;
const URL_RE = /https?:\/\//i;

// Walk every string in the registry; flag absolute filesystem paths, IPs, and
// URLs. Prompts are transcribed into this file from a private corpus, so a
// pasted path is the realistic failure mode this sweep exists to catch.
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

function slotsIn(text) {
  const out = [];
  for (const m of String(text).matchAll(SLOT_RE)) out.push(m[1]);
  return out;
}

// A ref is either a symbolic shared: path (verifiable — it must be a real file
// under shared/assets/, the only root the server's resolve_style_ref accepts) or
// a bare styleRefs key configured on the operator's machine (unverifiable here).
function checkRefs(refs, where, r) {
  if (refs == null) return;
  if (typeof refs !== 'object' || Array.isArray(refs)) { r.error(`${where} refs must be an object`); return; }
  for (const [key, value] of Object.entries(refs)) {
    if (typeof value !== 'string' || !value) { r.error(`${where} refs.${key} must be a non-empty string`); continue; }
    if (value.startsWith('shared:')) {
      const rel = value.slice('shared:'.length);
      if (!rel || rel.split('/').includes('..')) r.error(`${where} refs.${key} ${JSON.stringify(value)} is not a safe shared: path`);
      else if (!isFile(`shared/assets/${rel}`)) r.error(`${where} refs.${key} ${JSON.stringify(value)} does not resolve to a file under shared/assets/`);
    } else if (value.includes(':')) {
      r.error(`${where} refs.${key} ${JSON.stringify(value)} is not a symbolic shared: ref or a bare styleRefs key`);
    } else if (!isKebabId(value)) {
      r.warn(`${where} refs.${key} ${JSON.stringify(value)} is a bare named ref; it must be a kebab styleRefs key`);
    } else {
      r.warn(`${where} refs.${key} ${JSON.stringify(value)} is a named styleRefs key — machine-local, not verifiable from the repo`);
    }
  }
}

function subjects() { return [{ id: 'generate-templates.json', document: DOCUMENT }]; }

function validate(subject, r) {
  let doc;
  try { doc = readJSON(subject.document); } catch (e) { r.error(`${subject.document} is missing or not valid JSON: ${e.message}`); return; }

  if (doc.format !== 'qlobe-generate-templates') r.error(`format must be "qlobe-generate-templates" (found ${JSON.stringify(doc.format)})`);
  if (doc.formatVersion !== 1) r.warn(`formatVersion should be 1 (found ${JSON.stringify(doc.formatVersion)})`);

  // --- no host, no absolute paths, no URLs anywhere in the registry ---
  scanStrings(doc, '', (where, msg) => r.error(`host/path leak at ${where || '(root)'}: ${msg}`));

  // --- styles{} ---
  const styles = doc.styles && typeof doc.styles === 'object' && !Array.isArray(doc.styles) ? doc.styles : null;
  if (!styles) { r.error('styles{} is missing or not an object'); return; }
  for (const [id, style] of Object.entries(styles)) {
    if (!isKebabId(id)) r.error(`style id ${JSON.stringify(id)} is not a kebab id`);
    if (!style || typeof style !== 'object') { r.error(`style "${id}" must be an object`); continue; }
    if (typeof style.label !== 'string' || !style.label.trim()) r.error(`style "${id}" needs a label`);
    if (!STYLE_STATUSES.has(style.status)) r.error(`style "${id}" status must be proven|unproven (found ${JSON.stringify(style.status)})`);
    if (style.suffix != null && typeof style.suffix !== 'string') r.error(`style "${id}" suffix must be a string`);
    else if (style.status === 'proven' && !String(style.suffix || '').trim()) r.error(`proven style "${id}" must carry a suffix`);
    else if (style.status === 'unproven' && !String(style.suffix || '').trim()) r.warn(`unproven style "${id}" has no suffix to draft from`);
    if (style.provenance != null && typeof style.provenance !== 'string') r.error(`style "${id}" provenance must be a string`);
    else if (!String(style.provenance || '').trim()) r.warn(`style "${id}" has no provenance note`);
    checkRefs(style.refs, `style "${id}"`, r);
  }

  // --- templates[] ---
  const templates = Array.isArray(doc.templates) ? doc.templates : null;
  if (!templates || !templates.length) { r.error('templates[] must be a non-empty array'); return; }

  const seen = new Set();
  for (const [i, t] of templates.entries()) {
    const label = t?.id || `#${i + 1}`;
    if (!t || typeof t !== 'object') { r.error(`templates[${i}] must be an object`); continue; }

    if (!isKebabId(t.id)) r.error(`template "${label}" has an invalid id (kebab required)`);
    else if (seen.has(t.id)) r.error(`duplicate template id "${t.id}"`);
    else seen.add(t.id);

    if (typeof t.label !== 'string' || !t.label.trim()) r.error(`template "${label}" needs a label`);
    // description — the one-line "what am I making?" the Generate page prints
    // under the template title (Phase 6.2, Feature J). Presentation only; the
    // server never reads it, so a missing one is a warning, not a break.
    if (t.description != null && (typeof t.description !== 'string' || !t.description.trim()))
      r.error(`template "${label}" description must be a non-empty string`);
    else if (t.description == null) r.warn(`template "${label}" has no one-line description`);
    if (!isKebabId(t.section)) r.error(`template "${label}" needs a kebab section`);
    if (!isKebabId(t.group)) r.error(`template "${label}" needs a kebab group`);
    if (typeof t.provenance !== 'string' || !t.provenance.trim()) r.warn(`template "${label}" has no provenance note`);

    // kind + workflow
    if (!KINDS.has(t.kind)) r.error(`template "${label}" kind must be one of ${[...KINDS].join('|')} (found ${JSON.stringify(t.kind)})`);
    const isVoice = t.kind === 'generate-voice';
    if (isVoice) {
      if (t.workflow != null && t.workflow !== VOICE_WORKFLOW)
        r.error(`template "${label}" is a voice template; workflow must be ${VOICE_WORKFLOW} (found ${JSON.stringify(t.workflow)})`);
    } else if (!IMAGE_WORKFLOWS.has(t.workflow)) {
      r.error(`template "${label}" workflow ${JSON.stringify(t.workflow)} is not in the image-workflow allow-list`);
    }
    if (t.kind === 'cutout-chain' && !CUTOUT_TARGETS.has(t.target) && t.maxSize == null)
      r.error(`template "${label}" is a cutout-chain; it needs target ∈ ${[...CUTOUT_TARGETS].join('|')} or a maxSize`);

    for (const dim of ['width', 'height']) {
      if (t[dim] == null) continue;
      if (!Number.isInteger(t[dim]) || t[dim] < 64 || t[dim] > 2048) r.error(`template "${label}" ${dim} must be an integer 64–2048 (found ${JSON.stringify(t[dim])})`);
    }
    if (t.seed != null && (!Number.isInteger(t.seed) || t.seed < 0)) r.error(`template "${label}" seed must be a non-negative integer`);
    if (t.pad != null && (!Number.isInteger(t.pad) || t.pad < 0 || t.pad > 64)) r.error(`template "${label}" pad must be an integer 0–64`);

    // refSlots[] — references the operator supplies per run (a body sheet, a
    // concept screen). They are declared, never resolved from the repo. Two
    // slot keys are presentation/fallback only and never touch generation:
    // `gallery` names the candidate sources for the studio's reference-gallery
    // chooser, `default` is a registry-declared fallback ref for the slot.
    const refSlotNames = new Set();
    if (t.refSlots != null && !Array.isArray(t.refSlots)) r.error(`template "${label}" refSlots must be an array`);
    for (const [j, s] of (Array.isArray(t.refSlots) ? t.refSlots : []).entries()) {
      if (!s || typeof s !== 'object') { r.error(`template "${label}" refSlots[${j}] must be an object`); continue; }
      if (typeof s.name !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(s.name))
        r.error(`template "${label}" refSlots[${j}] name ${JSON.stringify(s?.name)} must be a lowerCamel identifier`);
      else if (refSlotNames.has(s.name)) r.error(`template "${label}" has a duplicate refSlot name ${JSON.stringify(s.name)}`);
      else refSlotNames.add(s.name);
      if (typeof s.label !== 'string' || !s.label.trim()) r.error(`template "${label}" refSlot ${JSON.stringify(s.name)} needs a label`);
      if (s.from != null && !REF_SOURCES.has(s.from)) r.error(`template "${label}" refSlot ${JSON.stringify(s.name)} from must be one of ${[...REF_SOURCES].join('|')}`);

      // gallery — candidate sources for the studio's reference gallery chooser.
      // Presentation-only (the server never reads it), but a stale entry would
      // silently break the chooser for an operator, so it is checked like any
      // other reference-bearing field.
      if (s.gallery != null) {
        if (!Array.isArray(s.gallery)) r.error(`template "${label}" refSlot ${JSON.stringify(s.name)} gallery must be an array`);
        else if (!s.gallery.length) r.error(`template "${label}" refSlot ${JSON.stringify(s.name)} gallery must not be empty`);
        else for (const [k, g] of s.gallery.entries()) {
          if (typeof g !== 'string' || !g) { r.error(`template "${label}" refSlot ${JSON.stringify(s.name)} gallery[${k}] must be a non-empty string`); continue; }
          if (g === 'media') continue;
          const m = /^shared:([a-z0-9-]+)$/.exec(g);
          if (!m || !isKebabId(m[1])) { r.error(`template "${label}" refSlot ${JSON.stringify(s.name)} gallery[${k}] ${JSON.stringify(g)} must be "media" or "shared:<dir>"`); continue; }
          if (!isDir(`shared/assets/${m[1]}`)) r.error(`template "${label}" refSlot ${JSON.stringify(s.name)} gallery[${k}] ${JSON.stringify(g)} does not resolve to a directory under shared/assets/`);
        }
      }

      // default — a registry-declared fallback for the slot, in the same
      // symbolic-ref grammar checkRefs already enforces for `refs`.
      if (s.default != null) {
        if (typeof s.default !== 'string' || !s.default) r.error(`template "${label}" refSlot ${JSON.stringify(s.name)} default must be a non-empty string`);
        else checkRefs({ default: s.default }, `template "${label}" refSlot ${JSON.stringify(s.name)}`, r);
      }
    }

    // fields[]
    const fieldNames = new Set();
    const fields = Array.isArray(t.fields) ? t.fields : [];
    if (t.fields != null && !Array.isArray(t.fields)) r.error(`template "${label}" fields must be an array`);
    for (const [j, f] of fields.entries()) {
      if (!f || typeof f !== 'object') { r.error(`template "${label}" fields[${j}] must be an object`); continue; }
      if (typeof f.name !== 'string' || !/^[a-z][A-Za-z0-9]*$/.test(f.name))
        r.error(`template "${label}" fields[${j}] name ${JSON.stringify(f?.name)} must be a lowerCamel identifier`);
      else if (fieldNames.has(f.name)) r.error(`template "${label}" has a duplicate field name ${JSON.stringify(f.name)}`);
      else fieldNames.add(f.name);
      if (!FIELD_TYPES.has(f.type)) r.error(`template "${label}" field ${JSON.stringify(f.name)} type must be one of ${[...FIELD_TYPES].join('|')}`);
      if (f.type === 'select') {
        if (!Array.isArray(f.options) || !f.options.length) r.error(`template "${label}" select field ${JSON.stringify(f.name)} needs options[]`);
        else if (f.default != null && !f.options.some((o) => (o && typeof o === 'object' ? o.value : o) === f.default))
          r.error(`template "${label}" field ${JSON.stringify(f.name)} default ${JSON.stringify(f.default)} is not one of its options`);
      }
      if (f.required === true && f.default != null) r.warn(`template "${label}" field ${JSON.stringify(f.name)} is required but also carries a default`);
    }

    // styles[] + defaultStyle
    const listed = Array.isArray(t.styles) ? t.styles : [];
    if (t.styles != null && !Array.isArray(t.styles)) r.error(`template "${label}" styles must be an array`);
    for (const sid of listed) {
      if (!styles[sid]) r.error(`template "${label}" references unknown style ${JSON.stringify(sid)}`);
      else if (styles[sid].status === 'proven' && !String(styles[sid].suffix || '').trim())
        r.error(`template "${label}" uses proven style ${JSON.stringify(sid)}, which has no suffix`);
    }
    if (t.defaultStyle != null) {
      if (!listed.includes(t.defaultStyle)) r.error(`template "${label}" defaultStyle ${JSON.stringify(t.defaultStyle)} is not one of its styles`);
    } else if (listed.length) {
      r.warn(`template "${label}" lists styles but declares no defaultStyle`);
    }

    // refs
    checkRefs(t.refs, `template "${label}"`, r);

    // An edit workflow cannot run without an input image. Check that a `style`
    // ref is reachable for every style the template offers — from the template,
    // from that style's own refs, from the variant, or from a run-time refSlot.
    const variantOf = (sid) => (t.variants && typeof t.variants === 'object' ? t.variants[sid] : null) || {};
    const styleRefReachable = (sid) =>
      !!(variantOf(sid).refs?.style || t.refs?.style || refSlotNames.has('style') || (sid && styles[sid]?.refs?.style));
    for (const sid of (listed.length ? listed : [null])) {
      const wf = variantOf(sid).workflow || t.workflow;
      if (EDIT_WORKFLOWS.has(wf) && !styleRefReachable(sid))
        r.error(`template "${label}"${sid ? ` on style ${JSON.stringify(sid)}` : ''} runs the edit workflow ${JSON.stringify(wf)} but no "style" ref is reachable (template refs, style refs, variant refs, or a refSlot)`);
    }

    // --- slot discipline: base prompt + every variant prompt ---
    const styleAware = listed.length > 0;
    const checkPrompt = (text, where) => {
      if (typeof text !== 'string' || text.trim().length < 3) { r.error(`${where} needs a prompt of at least 3 characters`); return; }
      for (const slot of slotsIn(text)) {
        if (STYLE_SLOTS.has(slot)) {
          if (!styleAware) r.error(`${where} uses {${slot}} but the template lists no styles`);
          continue;
        }
        if (!slot.trim()) { r.error(`${where} contains an empty {} slot`); continue; }
        if (!fieldNames.has(slot)) r.error(`${where} uses {${slot}}, which is not a declared field or ${[...STYLE_SLOTS].map((s) => `{${s}}`).join('/')}`);
      }
    };
    checkPrompt(t.prompt, `template "${label}" prompt`);
    if (t.extractPrompt != null) checkPrompt(t.extractPrompt, `template "${label}" extractPrompt`);

    // variants: shallow overrides keyed by a style the template actually lists
    const variants = t.variants && typeof t.variants === 'object' && !Array.isArray(t.variants) ? t.variants : null;
    if (t.variants != null && !variants) r.error(`template "${label}" variants must be an object keyed by style id`);
    for (const [sid, v] of Object.entries(variants || {})) {
      if (!styles[sid]) r.error(`template "${label}" variant ${JSON.stringify(sid)} is not a declared style`);
      else if (!listed.includes(sid)) r.warn(`template "${label}" has a variant for style ${JSON.stringify(sid)}, which it does not list`);
      if (!v || typeof v !== 'object') { r.error(`template "${label}" variant ${JSON.stringify(sid)} must be an object`); continue; }
      if (v.prompt != null) checkPrompt(v.prompt, `template "${label}" variant ${JSON.stringify(sid)} prompt`);
      if (v.workflow != null && !IMAGE_WORKFLOWS.has(v.workflow) && v.workflow !== VOICE_WORKFLOW)
        r.error(`template "${label}" variant ${JSON.stringify(sid)} workflow ${JSON.stringify(v.workflow)} is not in the allow-list`);
      for (const dim of ['width', 'height']) {
        if (v[dim] != null && (!Number.isInteger(v[dim]) || v[dim] < 64 || v[dim] > 2048))
          r.error(`template "${label}" variant ${JSON.stringify(sid)} ${dim} must be an integer 64–2048`);
      }
      if (v.seed != null && (!Number.isInteger(v.seed) || v.seed < 0)) r.error(`template "${label}" variant ${JSON.stringify(sid)} seed must be a non-negative integer`);
      checkRefs(v.refs, `template "${label}" variant ${JSON.stringify(sid)}`, r);
    }

    // examples[]
    if (t.examples != null && !Array.isArray(t.examples)) r.error(`template "${label}" examples must be an array`);
    else if (Array.isArray(t.examples) && t.examples.some((e) => typeof e !== 'string' || !e.trim()))
      r.error(`template "${label}" examples must all be non-empty strings`);
    if (t.assignHint != null && typeof t.assignHint !== 'string') r.error(`template "${label}" assignHint must be a string`);
  }

  r.info(`${Object.keys(styles).length} style(s), ${templates.length} template(s)`);
}

export default { target: 'generate-templates', aliases: ['templates', 'generate'], subjects, validate };
