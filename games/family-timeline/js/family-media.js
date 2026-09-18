// Private, local-only photo storage for Family Timeline.
// Privacy invariant: only the JPEG Blob is stored locally; no filename, URL,
// EXIF metadata, or media bytes are returned by serializablePhotoState().
const DB_NAME = 'qlobe-family-timeline-v1';
const STORE_NAME = 'photos';
const KEY = 'now-photo';
const MAX_BYTES = 15 * 1024 * 1024;
let memoryPhoto = null;
let hasPhoto = false;
let dbPromise = null;
let isPersistent = false;

function request(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}
function done(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}
async function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!globalThis.indexedDB) return resolve(null);
    const open = indexedDB.open(DB_NAME, 1);
    open.onupgradeneeded = () => open.result.createObjectStore(STORE_NAME);
    open.onsuccess = () => { isPersistent = true; open.result.onversionchange = () => open.result.close(); resolve(open.result); };
    open.onerror = () => resolve(null);
    open.onblocked = () => resolve(null);
  });
  return dbPromise;
}

export async function putPhoto(blob) {
  if (!(blob instanceof Blob) || !blob.type.startsWith('image/')) throw new Error('Expected an image Blob');
  const db = await openDb();
  if (!db) { memoryPhoto = blob; hasPhoto = true; return; }
  const tx = db.transaction(STORE_NAME, 'readwrite');
  tx.objectStore(STORE_NAME).put(blob, KEY);
  await done(tx);
  hasPhoto = true;
}
export async function getPhoto() {
  const db = await openDb();
  if (!db) return memoryPhoto;
  const photo = await request(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(KEY));
  hasPhoto = Boolean(photo);
  return photo;
}
export async function deletePhoto() {
  memoryPhoto = null;
  hasPhoto = false;
  const db = await openDb();
  if (!db) return;
  const tx = db.transaction(STORE_NAME, 'readwrite'); tx.objectStore(STORE_NAME).delete(KEY); await done(tx);
}
export async function clear() { return deletePhoto(); }
export function persistent() { return isPersistent; }

export function serializablePhotoState() { return { hasPhoto, persistent: isPersistent }; }

export async function imageFileToJpeg(file, maxEdge = 1280) {
  if (!file || !/^image\//.test(file.type) || file.size > MAX_BYTES) throw new Error('Expected an image no larger than 15 MB');
  let source; let url = '';
  try {
    if (globalThis.createImageBitmap) source = await createImageBitmap(file);
    else { url = URL.createObjectURL(file); source = await new Promise((resolve, reject) => { const image = new Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = url; }); }
    const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(source.width * scale)); canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext('2d', { alpha: false }); context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(source, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Browser could not encode image')), 'image/jpeg', .86));
  } finally { source?.close?.(); if (url) URL.revokeObjectURL(url); }
}

export function createObjectUrl(blob) { return blob ? URL.createObjectURL(blob) : ''; }
export function revokeObjectUrl(url) { if (url) URL.revokeObjectURL(url); }
