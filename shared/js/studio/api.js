const ALLOWED_DOCUMENT_PREFIXES = ['shared/characters/', 'shared/props/', 'games/'];

export function assertStudioPath(path) {
  const value = String(path || '').replaceAll('\\', '/');
  if (!value || value.startsWith('/') || value.split('/').includes('..') ||
      !ALLOWED_DOCUMENT_PREFIXES.some((prefix) => value.startsWith(prefix)) ||
      !value.endsWith('.json')) {
    throw new Error('Studio documents must be JSON under shared/characters, shared/props, or games');
  }
  return value;
}

export async function serverStatus() {
  const response = await fetch('/api/studio/status', { cache: 'no-store' });
  if (!response.ok) throw new Error('static preview');
  return response.json();
}

export async function readDocument(path) {
  path = assertStudioPath(path);
  const response = await fetch(`/api/studio/document?path=${encodeURIComponent(path)}`, { cache: 'no-store' });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Could not read ${path}`);
  return body.document;
}

export async function saveDocument(path, document) {
  path = assertStudioPath(path);
  const response = await fetch(`/api/studio/document?path=${encodeURIComponent(path)}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(document, null, 2) + '\n',
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Could not save ${path}`);
  return body;
}

export function assertStudioAssetPath(path) {
  const value = String(path || '').replaceAll('\\', '/');
  if (!value || value.startsWith('/') || value.split('/').includes('..') ||
      !/^(?:games\/[^/]+\/assets\/|shared\/(?:characters|props)\/)/.test(value) ||
      !/\.(?:png|jpe?g|webp)$/i.test(value)) {
    throw new Error('Studio assets must be PNG, JPEG, or WebP under a game/shared asset root');
  }
  return value;
}

export async function uploadAsset(path, blob) {
  path = assertStudioAssetPath(path);
  const response = await fetch(`/api/studio/asset?path=${encodeURIComponent(path)}`, { method: 'POST', body: blob });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Could not save ${path}`);
  return body;
}

export async function generateStoryScene({ storyId, prompt, seed, overwrite=false }) {
  const response = await fetch('/api/studio/story-scene', {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify({storyId,prompt,seed,overwrite}),
  });
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||'Could not queue the story scene');
  return body;
}

export async function studioJob(jobId) {
  const response=await fetch(`/api/studio/jobs/${encodeURIComponent(jobId)}`,{cache:'no-store'});
  const body=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(body.error||'Could not read the Studio job');
  return body.job;
}

export function downloadDocument(filename, document) {
  const blob = new Blob([JSON.stringify(document, null, 2) + '\n'], { type: 'application/json' });
  const link = documentNode('a');
  link.href = URL.createObjectURL(blob); link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function documentNode(tag) { return globalThis.document.createElement(tag); }
