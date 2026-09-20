const DB_NAME = 'qlobe-song-story-remix-v1';
const STORE_NAME = 'shows';

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed'));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('IndexedDB transaction failed'));
    transaction.onabort = () => reject(transaction.error || new Error('IndexedDB transaction aborted'));
  });
}

export function serializableShow(show) {
  if (!show) return null;
  const { mediaBlob, ...metadata } = show;
  return { ...metadata, hasMedia: Boolean(mediaBlob?.size) };
}

export function createReplayUrl(blob) {
  if (!(blob instanceof Blob) || !blob.size) return null;
  const url = URL.createObjectURL(blob);
  let released = false;
  return {
    url,
    release() {
      if (released) return;
      released = true;
      URL.revokeObjectURL(url);
    },
  };
}

/** Blob-capable local shelf with a session-memory fallback. */
export function createShowStore({ maxShows = 8 } = {}) {
  const fallback = new Map();
  let databasePromise = null;
  let persistent = false;

  function open() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve) => {
      if (!globalThis.indexedDB) {
        resolve(null);
        return;
      }
      let request;
      try {
        request = indexedDB.open(DB_NAME, 1);
      } catch {
        resolve(null);
        return;
      }
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          const store = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('createdAt', 'createdAt');
        }
      };
      request.onsuccess = () => {
        persistent = true;
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
    return databasePromise;
  }

  async function rawList() {
    const database = await open();
    if (!database) return [...fallback.values()];
    let values = [];
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      values = await requestResult(transaction.objectStore(STORE_NAME).getAll());
      await transactionDone(transaction);
    } catch {
      persistent = false;
    }
    const merged = new Map(values.map((item) => [item.id, item]));
    for (const [id, item] of fallback) merged.set(id, item);
    return [...merged.values()];
  }

  async function list() {
    return (await rawList()).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
  }

  async function get(id) {
    if (fallback.has(id)) return fallback.get(id);
    const database = await open();
    if (!database) return fallback.get(id) || null;
    try {
      const transaction = database.transaction(STORE_NAME, 'readonly');
      const value = await requestResult(transaction.objectStore(STORE_NAME).get(id));
      await transactionDone(transaction);
      return value || null;
    } catch {
      persistent = false;
      return fallback.get(id) || null;
    }
  }

  async function remove(id) {
    fallback.delete(id);
    const database = await open();
    if (!database) return;
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      await transactionDone(transaction);
    } catch {
      persistent = false;
    }
  }

  async function put(value) {
    const show = {
      ...value,
      id: value.id || globalThis.crypto?.randomUUID?.() || `remix-${Date.now()}`,
      gameId: 'song-story-remix',
      createdAt: Number(value.createdAt) || Date.now(),
    };
    const existing = await rawList();
    const overflow = existing
      .filter((item) => item.id !== show.id)
      .sort((a, b) => Number(a.createdAt) - Number(b.createdAt))
      .slice(0, Math.max(0, existing.length - maxShows + 1));
    for (const old of overflow) await remove(old.id);
    const database = await open();
    if (!database) {
      fallback.set(show.id, show);
      return show;
    }
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(show);
      await transactionDone(transaction);
      return show;
    } catch {
      persistent = false;
      fallback.set(show.id, show);
      return show;
    }
  }

  async function clear() {
    fallback.clear();
    const database = await open();
    if (!database) return;
    try {
      const transaction = database.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).clear();
      await transactionDone(transaction);
    } catch {
      persistent = false;
    }
  }

  return {
    put,
    list,
    get,
    delete: remove,
    clear,
    persistent: () => persistent,
  };
}
