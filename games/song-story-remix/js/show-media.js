const VIDEO_TYPES = [
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp8,opus',
  'video/webm',
];

export function preferredVideoMimeType() {
  if (!globalThis.MediaRecorder) return '';
  return VIDEO_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

/** Local-only, bounded, combined front-camera and microphone recorder. */
export function createVideoRecorder({
  mode = 'real',
  maxDuration = 17_000,
  onLevel = () => {},
  onState = () => {},
  onAutoStop = () => {},
} = {}) {
  let stream = null;
  let recorder = null;
  let preview = null;
  let chunks = [];
  let maxTimer = 0;
  let requestTimer = 0;
  let startedAt = 0;
  let animationFrame = 0;
  let audioContext = null;
  let analyser = null;
  let stopPromise = null;
  let generation = 0;
  let fakeRecording = false;

  const stopTracks = (target = stream) => {
    target?.getTracks?.().forEach((track) => track.stop());
    if (target === stream) stream = null;
  };

  function clearPreview() {
    if (!preview) return;
    try { preview.pause(); } catch { /* optional preview */ }
    preview.srcObject = null;
    preview = null;
  }

  function stopMeter() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    analyser = null;
    audioContext?.close?.().catch(() => {});
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
    onLevel(Math.min(1, Math.sqrt(energy / values.length) * 3.4));
    animationFrame = requestAnimationFrame(meterFrame);
  }

  function result(blob = null, simulated = false) {
    return {
      blob,
      simulated,
      duration: Math.max(0, Math.min(maxDuration, Date.now() - startedAt)),
      mimeType: blob?.type || recorder?.mimeType || '',
    };
  }

  async function start(videoElement) {
    if (recorder || fakeRecording || stream) return false;
    const token = ++generation;
    chunks = [];
    stopPromise = null;
    preview = videoElement || null;
    onState('requesting');
    if (mode === 'denied') {
      onState('denied');
      return false;
    }
    startedAt = Date.now();
    if (mode === 'fake') {
      fakeRecording = true;
      onState('recording');
      maxTimer = globalThis.setTimeout(async () => onAutoStop(await stop()), maxDuration);
      return true;
    }
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      onState('unavailable');
      return false;
    }

    let expired = false;
    const request = navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: {
        facingMode: 'user',
        width: { ideal: 640, max: 960 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 24, max: 30 },
      },
    }).then((lateStream) => {
      if (expired || token !== generation) {
        stopTracks(lateStream);
        throw new DOMException('Camera request expired', 'AbortError');
      }
      return lateStream;
    });
    const timeout = new Promise((_, reject) => {
      requestTimer = globalThis.setTimeout(() => {
        expired = true;
        reject(new DOMException('Camera request timed out', 'NotAllowedError'));
      }, 10_000);
    });

    try {
      stream = await Promise.race([request, timeout]);
      globalThis.clearTimeout(requestTimer);
      requestTimer = 0;
      if (token !== generation) {
        stopTracks();
        return false;
      }
      if (preview) {
        preview.muted = true;
        preview.playsInline = true;
        preview.autoplay = true;
        preview.srcObject = stream;
        await preview.play().catch(() => {});
      }
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (AudioContextClass && stream.getAudioTracks().length) {
        audioContext = new AudioContextClass();
        const source = audioContext.createMediaStreamSource(stream);
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        meterFrame();
      }
      const mimeType = preferredVideoMimeType();
      recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 2_400_000 } : undefined);
      recorder.addEventListener('dataavailable', (event) => {
        if (event.data?.size) chunks.push(event.data);
      });
      recorder.start(250);
      startedAt = Date.now();
      onState('recording');
      maxTimer = globalThis.setTimeout(async () => onAutoStop(await stop()), maxDuration);
      return true;
    } catch {
      globalThis.clearTimeout(requestTimer);
      requestTimer = 0;
      stopTracks();
      clearPreview();
      stopMeter();
      onState('denied');
      return false;
    }
  }

  function stop() {
    if (stopPromise) return stopPromise;
    globalThis.clearTimeout(maxTimer);
    maxTimer = 0;
    if (fakeRecording) {
      fakeRecording = false;
      onState('stopped');
      clearPreview();
      return Promise.resolve(result(null, true));
    }
    if (!recorder) {
      stopTracks();
      clearPreview();
      stopMeter();
      return Promise.resolve(result());
    }
    stopPromise = new Promise((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        const type = recorder?.mimeType || chunks[0]?.type || 'video/webm';
        const blob = chunks.length ? new Blob(chunks, { type }) : null;
        stopTracks();
        clearPreview();
        stopMeter();
        recorder = null;
        onState('stopped');
        resolve(result(blob));
      };
      recorder.addEventListener('stop', finish, { once: true });
      recorder.addEventListener('error', finish, { once: true });
      if (recorder.state === 'inactive') finish();
      else {
        try { recorder.requestData(); } catch { /* optional */ }
        try { recorder.stop(); } catch { finish(); }
      }
    });
    return stopPromise;
  }

  function cleanup() {
    generation += 1;
    globalThis.clearTimeout(maxTimer);
    globalThis.clearTimeout(requestTimer);
    maxTimer = 0;
    requestTimer = 0;
    fakeRecording = false;
    if (recorder?.state && recorder.state !== 'inactive') {
      try { recorder.stop(); } catch { /* already stopping */ }
    }
    recorder = null;
    stopTracks();
    clearPreview();
    stopMeter();
    onState('idle');
  }

  return {
    start,
    stop,
    cleanup,
    isRecording: () => Boolean(fakeRecording || (recorder && recorder.state !== 'inactive')),
    hasLiveStream: () => Boolean(stream?.active),
  };
}
