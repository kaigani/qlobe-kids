/** Private, local-only media helpers for Family Story Interview. */
const DB_NAME = 'qlobe-family-story-interview-v1';
const STORE_NAME = 'memories';
const MAX_MEMORIES = 12;

function preferredMimeType() {
  if (!globalThis.MediaRecorder) return '';
  return [
    'audio/mp4',
    'audio/webm;codecs=opus',
    'audio/webm',
  ].find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

/**
 * Create one bounded recorder. `mode` is `real`, `fake`, or `denied`; the two
 * latter values exist solely for deterministic local browser QA.
 */
export function createRecorder({
  mode = 'real',
  maxDuration = 60_000,
  onLevel = () => {},
  onState = () => {},
  onAutoStop = () => {},
} = {}) {
  let recorder = null;
  let stream = null;
  let audioContext = null;
  let analyser = null;
  let animationFrame = 0;
  let maxTimer = 0;
  let startedAt = 0;
  let chunks = [];
  let stopPromise = null;
  let fakeRecording = false;
  let cancelled = false;

  function stopTracks(target = stream) {
    target?.getTracks?.().forEach((track) => track.stop());
    if (target === stream) stream = null;
  }

  function stopMeter() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    analyser = null;
    if (audioContext) audioContext.close().catch(() => {});
    audioContext = null;
    onLevel(0);
  }

  function meterFrame() {
    if (!analyser) return;
    const values = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(values);
    let energy = 0;
    for (const value of values) {
      const centered = (value - 128) / 128;
      energy += centered * centered;
    }
    onLevel(Math.min(1, Math.sqrt(energy / values.length) * 3.2));
    animationFrame = requestAnimationFrame(meterFrame);
  }

  function result(blob = null) {
    return {
      blob,
      duration: Math.max(0, Math.min(maxDuration, Date.now() - startedAt)),
    };
  }

  async function start() {
    if (recorder || fakeRecording || cancelled) return;
    chunks = [];
    stopPromise = null;
    onState('requesting');
    if (mode === 'denied') {
      onState('denied');
      return result();
    }
    startedAt = Date.now();
    if (mode === 'fake') {
      fakeRecording = true;
      onState('recording');
      maxTimer = window.setTimeout(async () => onAutoStop(await stop()), maxDuration);
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      onState('denied');
      return result();
    }

    let timedOut = false;
    const request = navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    }).then((lateStream) => {
      if (timedOut || cancelled) {
        stopTracks(lateStream);
        throw new DOMException('Microphone request timed out', 'NotAllowedError');
      }
      return lateStream;
    });
    const timeout = new Promise((_, reject) => window.setTimeout(() => {
      timedOut = true;
      reject(new DOMException('Microphone request timed out', 'NotAllowedError'));
    }, 8_000));
    try {
      stream = await Promise.race([request, timeout]);
      if (cancelled) {
        stopTracks();
        return result();
      }
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (AudioContextClass) {
        audioContext = new AudioContextClass();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        meterFrame();
      }
      const mimeType = preferredMimeType();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) chunks.push(event.data);
      });
      recorder.start(200);
      startedAt = Date.now();
      onState('recording');
      maxTimer = window.setTimeout(async () => onAutoStop(await stop()), maxDuration);
    } catch {
      stopTracks();
      stopMeter();
      onState('denied');
      return result();
    }
  }

  function stop() {
    if (stopPromise) return stopPromise;
    window.clearTimeout(maxTimer);
    maxTimer = 0;
    if (fakeRecording) {
      fakeRecording = false;
      const fake = new Blob(['QLOBE_FAKE_RECORDING'], { type: 'audio/webm' });
      onState('stopped');
      return Promise.resolve(result(fake));
    }
    if (!recorder) {
      stopTracks();
      stopMeter();
      return Promise.resolve(result());
    }
    stopPromise = new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        const mimeType = recorder?.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = chunks.length ? new Blob(chunks, { type: mimeType }) : null;
        stopTracks();
        stopMeter();
        recorder = null;
        onState('stopped');
        resolve(result(blob));
      };
      recorder.addEventListener('stop', finish, { once: true });
      recorder.addEventListener('error', finish, { once: true });
      if (recorder.state === 'inactive') finish();
      else {
        try { recorder.stop(); } catch { finish(); }
      }
    });
    return stopPromise;
  }

  function cleanup() {
    cancelled = true;
    window.clearTimeout(maxTimer);
    maxTimer = 0;
    fakeRecording = false;
    if (recorder?.state && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* already closing */ }
    }
    stopTracks();
    stopMeter();
  }

  return { start, stop, cleanup };
}

let replayAudio = null;
let replayUrl = '';

/** Use one audio element and one revocable URL for all family-story replays. */
export function replayBlob(blob) {
  if (!blob) return null;
  if (!replayAudio) replayAudio = new Audio();
  if (replayUrl) URL.revokeObjectURL(replayUrl);
  replayAudio.pause();
  replayUrl = URL.createObjectURL(blob);
  replayAudio.src = replayUrl;
  replayAudio.currentTime = 0;
  const ownedUrl = replayUrl;
  const release = () => {
    if (replayAudio?.src === ownedUrl || replayUrl === ownedUrl) {
      replayAudio.pause();
      replayAudio.removeAttribute('src');
      replayAudio.load();
      replayUrl = '';
    }
    URL.revokeObjectURL(ownedUrl);
  };
  replayAudio.addEventListener('ended', release, { once: true });
  return { audio: replayAudio, url: ownedUrl, release };
}

/** Validate and downscale a local photo before placing it in IndexedDB. */
export async function imageFileToJpeg(file, maxEdge = 1280) {
  if (!file || !/^image\//.test(file.type) || file.size > 15 * 1024 * 1024) {
    throw new Error('Expected an image no larger than 15 MB');
  }
  let source = null;
  let objectUrl = '';
  try {
    if (globalThis.createImageBitmap) source = await createImageBitmap(file);
    else {
      objectUrl = URL.createObjectURL(file);
      source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = objectUrl;
      });
    }
    const scale = Math.min(1, maxEdge / Math.max(source.width, source.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(source.width * scale));
    canvas.height = Math.max(1, Math.round(source.height * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fffaf0';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', .86));
    if (!jpeg) throw new Error('Browser could not encode the image');
    return jpeg;
  } finally {
    source?.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

/** Plain QA-safe metadata: never expose family media through the debug hook. */
export function serializableMemory(memory) {
  if (!memory) return null;
  const { audioBlob, photoBlob, ...metadata } = memory;
  return {
    ...metadata,
    hasAudio: Boolean(audioBlob),
    hasPhoto: Boolean(photoBlob),
  };
}

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

/** Blob-capable local store with a session-memory fallback. */
export function createMemoryStore() {
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
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(STORE_NAME)) {
          const objectStore = request.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
          objectStore.createIndex('createdAt', 'createdAt');
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

  async function list() {
    const database = await open();
    if (!database) return [...fallback.values()];
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const memories = await requestResult(transaction.objectStore(STORE_NAME).getAll());
    await transactionDone(transaction);
    return memories;
  }

  async function remove(id) {
    const database = await open();
    if (!database) {
      fallback.delete(id);
      return;
    }
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).delete(id);
    await transactionDone(transaction);
  }

  async function put(value) {
    const memory = {
      ...value,
      id: value.id || globalThis.crypto?.randomUUID?.() || `memory-${Date.now()}`,
      gameId: 'family-story-interview',
    };
    const existing = await list();
    const overflow = existing
      .filter((item) => item.id !== memory.id)
      .sort((a, b) => a.createdAt - b.createdAt)
      .slice(0, Math.max(0, existing.length - MAX_MEMORIES + 1));
    for (const old of overflow) await remove(old.id);
    const database = await open();
    if (!database) {
      fallback.set(memory.id, memory);
      return memory;
    }
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put(memory);
    await transactionDone(transaction);
    return memory;
  }

  async function clear() {
    const database = await open();
    if (!database) {
      fallback.clear();
      return;
    }
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    await transactionDone(transaction);
  }

  return {
    persistent: () => persistent,
    put,
    list,
    delete: remove,
    clear,
  };
}
