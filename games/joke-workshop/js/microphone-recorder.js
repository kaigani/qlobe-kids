const DEFAULT_MAX_DURATION_MS = 15_000;

export function createMicrophoneRecorder({ maxDurationMs = DEFAULT_MAX_DURATION_MS, onLimit = null } = {}) {
  let stream = null;
  let media = null;
  let chunks = [];
  let limitTimer = 0;
  let stopPromise = null;

  async function request() {
    stopStream();
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') return false;
    try {
      const requestPromise = navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
        video: false,
      });
      let requestTimeout = 0;
      const result = await Promise.race([
        requestPromise,
        new Promise((resolve) => {
          requestTimeout = window.setTimeout(() => resolve(null), 6000);
        }),
      ]);
      window.clearTimeout(requestTimeout);
      if (!result) {
        requestPromise.then((lateStream) => lateStream.getTracks().forEach((track) => track.stop())).catch(() => {});
        return false;
      }
      stream = result;
      return true;
    } catch {
      stream = null;
      return false;
    }
  }

  function start() {
    if (!stream || media || typeof MediaRecorder === 'undefined') return false;
    chunks = [];
    stopPromise = null;
    try {
      const mimeType = preferredMimeType();
      media = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      media.addEventListener('dataavailable', (event) => {
        if (event.data?.size) chunks.push(event.data);
      });
      media.start(250);
      limitTimer = window.setTimeout(() => {
        if (media && typeof onLimit === 'function') onLimit();
      }, maxDurationMs);
      return true;
    } catch {
      media = null;
      stopStream();
      return false;
    }
  }

  function stop() {
    if (stopPromise) return stopPromise;
    if (!media) {
      stopStream();
      return Promise.resolve(null);
    }
    clearLimitTimer();
    const recorder = media;
    media = null;
    stopPromise = new Promise((resolve) => {
      const finish = () => {
        const mimeType = recorder.mimeType || chunks[0]?.type || 'audio/webm';
        const blob = chunks.length ? new Blob(chunks, { type: mimeType }) : null;
        chunks = [];
        stopStream();
        stopPromise = null;
        resolve(blob);
      };
      recorder.addEventListener('stop', finish, { once: true });
      try { recorder.stop(); } catch { finish(); }
    });
    return stopPromise;
  }

  function cancel() {
    clearLimitTimer();
    const recorder = media;
    media = null;
    chunks = [];
    stopPromise = null;
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* already stopped */ }
    }
    stopStream();
  }

  function isRecording() {
    return Boolean(media);
  }

  function clearLimitTimer() {
    if (!limitTimer) return;
    window.clearTimeout(limitTimer);
    limitTimer = 0;
  }

  function stopStream() {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
    stream = null;
  }

  return { request, start, stop, cancel, isRecording };
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
