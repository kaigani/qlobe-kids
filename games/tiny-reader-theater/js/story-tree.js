// story-tree.js — the branching-story resolver for Tiny Reader Theater.
//
// PURE. No DOM, no audio, no timers, no imports. Everything here is a function
// of the plain `setting` object read out of config.json:
//
//   { id, title, locked, stage: {...}, tree: { <nodeId>: node, … } }
//
// A node is:
//   { beat: 'investigate', lines: ['…', '…'], choices?: [ { id, label, next } ],
//     summary?: 'one sentence',
//     beats?: ['walk-on-discover', …],   // one per line; falls back to `beat`
//     staging?: { scenery: [{prop,x,y,scale}], props: [id | {prop,x,y}] } }
// `beats`/`staging` are interpreted by theater-scene.js; this resolver only
// checks their shape.
//
// A node with `choices` is a branch (Beginning / Middle). A node with `summary`
// and no `choices` is an Ending. That is the entire grammar — the resolver
// never needs to know which tier a node id belongs to, so adding a fourth tier
// (or Castle's differently shaped tree) is a config change, not a code change.
//
// Kept dependency-free on purpose: this is the one piece of the game that is
// unit-testable in isolation (`node -e "import('./js/story-tree.js')…"`), and
// the piece most likely to be promoted to shared/js/ once a second game wants
// a branching story.

/** The conventional entry node id. */
export const START_NODE_ID = 'beginning';

/**
 * The node id a story starts at: `beginning` when the tree defines it,
 * otherwise the tree's first key (so a differently-authored tree still runs).
 * @param {object} setting
 * @returns {string|null}
 */
export function startNodeId(setting) {
  const tree = getTree(setting);
  if (!tree) return null;
  if (tree[START_NODE_ID]) return START_NODE_ID;
  const first = Object.keys(tree)[0];
  return first || null;
}

/**
 * Look a node up by id.
 * @param {object} setting
 * @param {string} nodeId
 * @returns {object|null} the node, or null when the id is unknown
 */
export function getNode(setting, nodeId) {
  const tree = getTree(setting);
  if (!tree || typeof nodeId !== 'string') return null;
  const node = tree[nodeId];
  return node && typeof node === 'object' ? node : null;
}

/**
 * The spoken/tappable lines of a node, always an array (never undefined, so a
 * caller can index it without guarding).
 * @returns {string[]}
 */
export function getLines(setting, nodeId) {
  const node = getNode(setting, nodeId);
  return Array.isArray(node?.lines) ? node.lines : [];
}

/**
 * A node's choice list, always an array. Endings return `[]`.
 * @returns {Array<{id: string, label: string, next: string}>}
 */
export function getChoices(setting, nodeId) {
  const node = getNode(setting, nodeId);
  return Array.isArray(node?.choices) ? node.choices : [];
}

/**
 * One choice of a node, by choice id.
 * @returns {{id: string, label: string, next: string}|null}
 */
export function getChoice(setting, nodeId, choiceId) {
  return getChoices(setting, nodeId).find((choice) => choice && choice.id === choiceId) || null;
}

/**
 * Resolve a choice to the node it leads to.
 *
 * Returns null for an unknown node, an unknown choice, or a choice whose
 * `next` does not exist in the tree — a dangling branch is a data bug and the
 * caller must not silently walk into `undefined`.
 *
 * @param {object} setting
 * @param {string} nodeId
 * @param {string} choiceId
 * @returns {string|null}
 */
export function nextNodeId(setting, nodeId, choiceId) {
  const choice = getChoice(setting, nodeId, choiceId);
  if (!choice || typeof choice.next !== 'string') return null;
  return getNode(setting, choice.next) ? choice.next : null;
}

/**
 * True when a node terminates the story: no choices left to make.
 * (`summary` is what the Complete screen speaks; a terminal node without one
 * still ends the story, it just has nothing extra to say.)
 */
export function isEnding(setting, nodeId) {
  const node = getNode(setting, nodeId);
  if (!node) return false;
  return getChoices(setting, nodeId).length === 0;
}

/** The ending's one-line summary, or '' when the node has none. */
export function getSummary(setting, nodeId) {
  const node = getNode(setting, nodeId);
  return typeof node?.summary === 'string' ? node.summary : '';
}

/** Every node id in the tree, in authoring order. */
export function listNodeIds(setting) {
  const tree = getTree(setting);
  return tree ? Object.keys(tree) : [];
}

/**
 * Every terminal node id, in authoring order — the canonical "9 endings"
 * collection the tracker counts against. Derived from the tree rather than
 * hard-coded, so Castle's tree gets its own correct total for free.
 * @returns {string[]}
 */
export function listEndingIds(setting) {
  return listNodeIds(setting).filter((id) => isEnding(setting, id));
}

/** How many endings this setting has. */
export function endingCount(setting) {
  return listEndingIds(setting).length;
}

/**
 * Walk a path of choice ids from the start node.
 * Stops (and reports where) at the first choice that does not resolve.
 *
 * @param {object} setting
 * @param {string[]} choiceIds
 * @returns {{nodeId: string|null, taken: string[], ok: boolean}}
 */
export function walk(setting, choiceIds = []) {
  let nodeId = startNodeId(setting);
  const taken = [];
  for (const choiceId of choiceIds) {
    const next = nodeId ? nextNodeId(setting, nodeId, choiceId) : null;
    if (!next) return { nodeId, taken, ok: false };
    taken.push(choiceId);
    nodeId = next;
  }
  return { nodeId, taken, ok: true };
}

/**
 * Structural check of a tree. Returns a list of human-readable problems —
 * empty means the tree is sound. Used by the QA driver and by
 * `QLOBE_DEBUG.validateTree()`; never called on the child's path.
 * @returns {string[]}
 */
export function validateTree(setting) {
  const problems = [];
  const tree = getTree(setting);
  const label = setting && setting.id ? setting.id : '(unknown setting)';
  if (!tree) return [`${label}: no tree`];
  const ids = Object.keys(tree);
  if (!ids.length) return [`${label}: tree is empty`];
  if (!startNodeId(setting)) problems.push(`${label}: no start node`);

  const reached = new Set([startNodeId(setting)]);
  for (const id of ids) {
    const node = tree[id];
    const lines = getLines(setting, id);
    if (!lines.length) problems.push(`${label}/${id}: no lines`);
    if (lines.some((line) => typeof line !== 'string' || !line.trim())) {
      problems.push(`${label}/${id}: blank line`);
    }
    const beats = Array.isArray(node.beats) ? node.beats : null;
    if (!node.beat && !beats) problems.push(`${label}/${id}: no beat`);
    if (beats && beats.length !== lines.length) {
      problems.push(`${label}/${id}: ${beats.length} beats for ${lines.length} lines`);
    }
    const choices = getChoices(setting, id);
    if (choices.length) {
      const seen = new Set();
      for (const choice of choices) {
        if (!choice || !choice.id) { problems.push(`${label}/${id}: choice without an id`); continue; }
        if (seen.has(choice.id)) problems.push(`${label}/${id}: duplicate choice '${choice.id}'`);
        seen.add(choice.id);
        if (!tree[choice.next]) problems.push(`${label}/${id}: choice '${choice.id}' points at missing node '${choice.next}'`);
        else reached.add(choice.next);
      }
    } else if (!getSummary(setting, id)) {
      problems.push(`${label}/${id}: ending with no summary`);
    }
  }
  for (const id of ids) {
    if (!reached.has(id)) problems.push(`${label}/${id}: unreachable`);
  }
  return problems;
}

// ---- internals ------------------------------------------------------------

function getTree(setting) {
  const tree = setting && setting.tree;
  return tree && typeof tree === 'object' ? tree : null;
}
