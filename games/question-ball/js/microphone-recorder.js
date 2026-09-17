const DEFAULT_MAX_DURATION_MS = 15_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 6_000;

/**
 * One short-lived, memory-only microphone recorder.
 * Permission is requested only when request() is called from a child gesture.
 */
export function createMicrophoneRecorder({
  maxDurationMs = DEFAULT_MAX_DURATION_MS,
  requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
  onLimit = null,
} = {}) {
  let stream = null;
  let recorder = null;
  let chunks = [];
  let limitTimer = 0;
  let requestGeneration = 0;
  let stopGeneration = 0;
  let stopPromise = null;
  let stoppingStream = null;

  async function request() {
    cancel();
    const generation = ++requestGeneration;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return { ok: false, reason: 'unsupported' };
    }

    let permissionRequest;
    try {
      permissionRequest = navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
    } catch {
      return { ok: false, reason: 'denied' };
    }

    let timeoutId = 0;
    const timeout = new Promise((resolve) => {
      timeoutId = window.setTimeout(() => resolve({ timeout: true }), requestTimeoutMs);
    });

    try {
      const result = await Promise.race([
        permissionRequest.then((value) => ({ value }), (error) => ({ error })),
        timeout,
      ]);
      window.clearTimeout(timeoutId);

      if (result?.timeout) {
        permissionRequest.then(stopTracks, () => {});
        return { ok: false, reason: 'timeout' };
      }
      if (result?.error || !result?.value) return { ok: false, reason: 'denied' };
      if (generation !== requestGeneration) {
        stopTracks(result.value);
        return { ok: false, reason: 'cancelled' };
      }
      stream = result.value;
      return { ok: true };
    } catch {
      window.clearTimeout(timeoutId);
      return { ok: false, reason: 'denied' };
    }
  }

  function start() {
    if (!stream || recorder || typeof MediaRecorder === 'undefined') return false;
    const sessionChunks = [];
    chunks = sessionChunks;
    stopPromise = null;
    try {
      const mimeType = preferredMimeType();
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) sessionChunks.push(event.data);
      });
      recorder.start(250);
      limitTimer = window.setTimeout(() => {
        if (recorder && typeof onLimit === 'function') onLimit();
      }, Math.max(500, Number(maxDurationMs) || DEFAULT_MAX_DURATION_MS));
      return true;
    } catch {
      recorder = null;
      stopStream();
      return false;
    }
  }

  function stop() {
    if (stopPromise) return stopPromise;
    if (!recorder) {
      stopStream();
      return Promise.resolve(null);
    }

    clearLimitTimer();
    const activeRecorder = recorder;
    const activeStream = stream;
    const activeChunks = chunks;
    const generation = ++stopGeneration;
    recorder = null;
    stream = null;
    chunks = [];
    stoppingStream = activeStream;
    stopPromise = new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        const mimeType = activeRecorder.mimeType || activeChunks[0]?.type || 'audio/webm';
        const blob = generation === stopGeneration && activeChunks.length
          ? new Blob(activeChunks, { type: mimeType })
          : null;
        activeChunks.length = 0;
        stopTracks(activeStream);
        if (stoppingStream === activeStream) stoppingStream = null;
        if (generation === stopGeneration) stopPromise = null;
        resolve(blob);
      };
      activeRecorder.addEventListener('stop', finish, { once: true });
      window.setTimeout(finish, 1200);
      try {
        if (activeRecorder.state === 'inactive') finish();
        else activeRecorder.stop();
      } catch {
        finish();
      }
    });
    return stopPromise;
  }

  function cancel() {
    requestGeneration += 1;
    stopGeneration += 1;
    clearLimitTimer();
    const activeRecorder = recorder;
    recorder = null;
    chunks = [];
    stopPromise = null;
    if (activeRecorder && activeRecorder.state !== 'inactive') {
      try { activeRecorder.stop(); } catch { /* already stopped */ }
    }
    stopStream();
    if (stoppingStream) {
      stopTracks(stoppingStream);
      stoppingStream = null;
    }
  }

  function isRecording() {
    return Boolean(recorder && recorder.state !== 'inactive');
  }

  function hasStream() {
    return Boolean(stream || stoppingStream);
  }

  function clearLimitTimer() {
    if (!limitTimer) return;
    window.clearTimeout(limitTimer);
    limitTimer = 0;
  }

  function stopStream() {
    if (!stream) return;
    stopTracks(stream);
    stream = null;
  }

  return { request, start, stop, cancel, isRecording, hasStream };
}

function stopTracks(mediaStream) {
  try {
    for (const track of mediaStream?.getTracks?.() || []) track.stop();
  } catch { /* microphone cleanup is best-effort on browser shutdown */ }
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
