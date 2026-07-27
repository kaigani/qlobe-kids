// Local-only microphone + action-timeline recording for child-directed games.
// Nothing in this module uploads, exports, or transmits a recording.

const DB_NAME = 'qlobe-kids-performances';
const DB_VERSION = 1;
const STORE_NAME = 'shows';
const FORMAT = 'qlobe-performance';
const FORMAT_VERSION = 1;
const DEFAULT_MAX_MS = 90_000;
const MAX_SHOWS = 24;

const memoryShows = new Map();

export function createPerformanceRecorder({
  gameId,
  maxDurationMs = DEFAULT_MAX_MS,
  onLimit = null,
  now = () => performance.now(),
} = {}) {
  if (!gameId) throw new Error('performance-recorder requires gameId');

  let stream = null;
  let media = null;
  let chunks = [];
  let startedAt = 0;
  let initialState = null;
  let metadata = {};
  let events = [];
  let limitTimer = 0;
  let stopPromise = null;
  let playback = null;

  async function requestMicrophone() {
    stopStream();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return false;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      return true;
    } catch {
      stream = null;
      return false;
    }
  }

  function start(state = {}, meta = {}) {
    if (startedAt) throw new Error('performance recording already active');
    cancelPlayback();
    initialState = cloneJson(state);
    metadata = cloneJson(meta);
    events = [];
    chunks = [];
    startedAt = now();
    stopPromise = null;

    if (stream && typeof MediaRecorder !== 'undefined') {
      try {
        const mimeType = preferredMimeType();
        media = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
        media.addEventListener('dataavailable', (event) => {
          if (event.data?.size) chunks.push(event.data);
        });
        media.start(250);
      } catch {
        media = null;
        stopStream();
      }
    }

    limitTimer = setTimeout(() => {
      if (typeof onLimit === 'function' && startedAt) onLimit();
    }, maxDurationMs);
    return { microphone: !!media };
  }

  function record(type, payload = {}) {
    if (!startedAt) return false;
    events.push({
      t: Math.max(0, Math.round(now() - startedAt)),
      type: String(type),
      payload: cloneJson(payload),
    });
    return true;
  }

  function stop(extraMetadata = {}) {
    if (stopPromise) return stopPromise;
    if (!startedAt) return Promise.resolve(null);

    const durationMs = Math.min(maxDurationMs, Math.max(1, Math.round(now() - startedAt)));
    const recorder = media;
    const finishedEvents = events.slice();
    const finishedState = cloneJson(initialState);
    const finishedMeta = { ...metadata, ...cloneJson(extraMetadata) };
    clearTimeout(limitTimer);
    limitTimer = 0;
    startedAt = 0;
    media = null;

    stopPromise = new Promise((resolve) => {
      const finish = () => {
        const mimeType = recorder?.mimeType || chunks[0]?.type || '';
        const audioBlob = chunks.length ? new Blob(chunks, { type: mimeType || 'audio/webm' }) : null;
        chunks = [];
        stopStream();
        resolve({
          format: FORMAT,
          formatVersion: FORMAT_VERSION,
          id: makeId(gameId),
          gameId,
          createdAt: new Date().toISOString(),
          durationMs,
          initialState: finishedState,
          metadata: finishedMeta,
          events: finishedEvents,
          audioBlob,
          audioType: audioBlob?.type || null,
          thumbnailBlob: null,
        });
      };

      if (recorder && recorder.state !== 'inactive') {
        recorder.addEventListener('stop', finish, { once: true });
        try { recorder.stop(); } catch { finish(); }
      } else {
        finish();
      }
    });
    return stopPromise;
  }

  async function play(show, { applyInitial, applyEvent, onStart, onEnd } = {}) {
    if (!show || show.format !== FORMAT) throw new Error('invalid performance recording');
    cancelPlayback();
    if (typeof applyInitial === 'function') await applyInitial(cloneJson(show.initialState || {}));

    const controller = { cancelled: false, raf: 0, audio: null, url: null };
    playback = controller;
    let audioStarted = false;
    if (show.audioBlob instanceof Blob && show.audioBlob.size) {
      controller.url = URL.createObjectURL(show.audioBlob);
      controller.audio = new Audio(controller.url);
      controller.audio.preload = 'auto';
      try {
        await controller.audio.play();
        audioStarted = true;
      } catch {
        audioStarted = false;
      }
    }
    if (typeof onStart === 'function') onStart({ audio: audioStarted });

    const began = now();
    const ordered = [...(show.events || [])].sort((a, b) => a.t - b.t);
    let cursor = 0;
    const duration = Math.max(1, show.durationMs || ordered.at(-1)?.t || 1);

    await new Promise((resolve) => {
      const tick = () => {
        if (controller.cancelled) { resolve(); return; }
        const elapsed = audioStarted
          ? Math.round((controller.audio.currentTime || 0) * 1000)
          : Math.round(now() - began);
        while (cursor < ordered.length && ordered[cursor].t <= elapsed) {
          if (typeof applyEvent === 'function') applyEvent(cloneJson(ordered[cursor]));
          cursor += 1;
        }
        if (elapsed >= duration || (audioStarted && controller.audio.ended)) {
          while (cursor < ordered.length) {
            if (typeof applyEvent === 'function') applyEvent(cloneJson(ordered[cursor]));
            cursor += 1;
          }
          resolve();
          return;
        }
        controller.raf = requestAnimationFrame(tick);
      };
      controller.raf = requestAnimationFrame(tick);
    });

    if (playback === controller) playback = null;
    cleanupPlayback(controller);
    if (!controller.cancelled && typeof onEnd === 'function') onEnd();
    return !controller.cancelled;
  }

  function cancelPlayback() {
    if (!playback) return;
    playback.cancelled = true;
    cleanupPlayback(playback);
    playback = null;
  }

  function isRecording() {
    return !!startedAt;
  }

  async function destroy() {
    clearTimeout(limitTimer);
    limitTimer = 0;
    cancelPlayback();
    if (startedAt) await stop();
    stopStream();
  }

  function stopStream() {
    if (!stream) return;
    for (const track of stream.getTracks()) track.stop();
    stream = null;
  }

  return {
    requestMicrophone,
    start,
    record,
    stop,
    play,
    cancelPlayback,
    isRecording,
    destroy,
  };
}

export async function openPerformanceStore(gameId, { maxShows = MAX_SHOWS } = {}) {
  if (!gameId) throw new Error('performance store requires gameId');
  const db = await openDb().catch(() => null);

  async function list() {
    const rows = db
      ? await requestResult(db.transaction(STORE_NAME).objectStore(STORE_NAME).index('gameId').getAll(gameId))
      : [...memoryShows.values()].filter((row) => row.gameId === gameId);
    return rows.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async function get(id) {
    if (db) return requestResult(db.transaction(STORE_NAME).objectStore(STORE_NAME).get(id));
    return memoryShows.get(id) || null;
  }

  async function save(show) {
    validateShow(show, gameId);
    const existing = await get(show.id);
    if (!existing && (await list()).length >= maxShows) {
      const error = new Error('show shelf is full');
      error.code = 'SHELF_FULL';
      throw error;
    }
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(show);
      await transactionDone(tx);
    } else {
      memoryShows.set(show.id, show);
    }
    return show;
  }

  async function remove(id) {
    if (db) {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(id);
      await transactionDone(tx);
    } else {
      memoryShows.delete(id);
    }
  }

  return { list, get, save, remove, persistent: !!db, maxShows };
}

function preferredMimeType() {
  const choices = [
    'audio/mp4;codecs=mp4a.40.2',
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
  ];
  return choices.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

function cleanupPlayback(controller) {
  if (controller.raf) cancelAnimationFrame(controller.raf);
  if (controller.audio) {
    controller.audio.pause();
    controller.audio.removeAttribute('src');
    controller.audio.load();
  }
  if (controller.url) URL.revokeObjectURL(controller.url);
}

function validateShow(show, gameId) {
  if (!show || show.format !== FORMAT || show.formatVersion !== FORMAT_VERSION) {
    throw new Error('unsupported performance format');
  }
  if (show.gameId !== gameId) throw new Error('performance belongs to another game');
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function makeId(gameId) {
  const suffix = crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${gameId}-${suffix}`;
}

function openDb() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('IndexedDB unavailable'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.addEventListener('upgradeneeded', () => {
      const db = request.result;
      const store = db.objectStoreNames.contains(STORE_NAME)
        ? request.transaction.objectStore(STORE_NAME)
        : db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      if (!store.indexNames.contains('gameId')) store.createIndex('gameId', 'gameId', { unique: false });
    });
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error || new Error('IndexedDB open failed')), { once: true });
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener('success', () => resolve(request.result), { once: true });
    request.addEventListener('error', () => reject(request.error || new Error('IndexedDB request failed')), { once: true });
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener('complete', resolve, { once: true });
    transaction.addEventListener('abort', () => reject(transaction.error || new Error('IndexedDB transaction aborted')), { once: true });
    transaction.addEventListener('error', () => reject(transaction.error || new Error('IndexedDB transaction failed')), { once: true });
  });
}

export const PERFORMANCE_FORMAT = FORMAT;
export const PERFORMANCE_FORMAT_VERSION = FORMAT_VERSION;
export const PERFORMANCE_MAX_SHOWS = MAX_SHOWS;
