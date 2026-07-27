// Render a saved QLOBE performance timeline into a local H.264/AAC MP4.
// The canvas and recorded voice never leave the device.

const MP4_TYPES = [
  // avc3 repeats codec configuration when a responsive canvas changes size.
  // Safari falls through to avc1/video-mp4 when avc3 is unavailable.
  'video/mp4;codecs=avc3.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc3.42E01E',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4',
];

export function preferredMp4Type() {
  if (typeof MediaRecorder === 'undefined') return '';
  return MP4_TYPES.find((type) => MediaRecorder.isTypeSupported?.(type)) || '';
}

export function canExportPerformanceMp4(canvas) {
  return !!(
    canvas
    && typeof canvas.captureStream === 'function'
    && typeof MediaStream !== 'undefined'
    && preferredMp4Type()
  );
}

export async function renderPerformanceMp4({
  canvas,
  show,
  applyEvent,
  onProgress = null,
  signal = null,
  frameRate = 30,
  videoBitsPerSecond = 5_000_000,
} = {}) {
  if (!show || !canvas) throw exportError('INVALID_EXPORT', 'A saved show and stage canvas are required.');
  const mimeType = preferredMp4Type();
  if (!canExportPerformanceMp4(canvas) || !mimeType) {
    throw exportError('MP4_UNSUPPORTED', 'This browser cannot create MP4 files yet.');
  }
  if (signal?.aborted) throw abortError();

  const videoStream = canvas.captureStream(frameRate);
  const videoTrack = videoStream.getVideoTracks()[0];
  if (!videoTrack) throw exportError('CAPTURE_FAILED', 'The puppet stage could not be captured.');

  let audioContext = null;
  let audioSource = null;
  let audioBuffer = null;
  let audioDestination = null;
  if (show.audioBlob instanceof Blob && show.audioBlob.size) {
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (AudioContextCtor) {
      try {
        audioContext = new AudioContextCtor();
        await audioContext.resume();
        audioBuffer = await audioContext.decodeAudioData(await show.audioBlob.arrayBuffer());
        audioSource = audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioDestination = audioContext.createMediaStreamDestination();
        audioSource.connect(audioDestination);
      } catch {
        await audioContext?.close().catch(() => {});
        audioContext = null;
        audioSource = null;
        audioBuffer = null;
        audioDestination = null;
      }
    }
  }

  const tracks = [videoTrack];
  const audioTrack = audioDestination?.stream.getAudioTracks()[0];
  if (audioTrack) tracks.push(audioTrack);
  const outputStream = new MediaStream(tracks);
  const chunks = [];
  let recorder;
  try {
    recorder = new MediaRecorder(outputStream, {
      mimeType,
      videoBitsPerSecond,
      audioBitsPerSecond: 128_000,
    });
  } catch {
    cleanupTracks(outputStream);
    await audioContext?.close().catch(() => {});
    throw exportError('CAPTURE_FAILED', 'The MP4 recorder could not start.');
  }

  const stopped = new Promise((resolve, reject) => {
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data?.size) chunks.push(event.data);
    });
    recorder.addEventListener('stop', resolve, { once: true });
    recorder.addEventListener('error', () => {
      reject(exportError('CAPTURE_FAILED', recorder.error?.message || 'The MP4 recorder stopped unexpectedly.'));
    }, { once: true });
  });

  const ordered = [...(show.events || [])].sort((a, b) => Number(a.t) - Number(b.t));
  const eventDuration = Number(ordered.at(-1)?.t) || 0;
  const audioDuration = Math.round((audioBuffer?.duration || 0) * 1000);
  const durationMs = Math.max(1, Number(show.durationMs) || 0, eventDuration, audioDuration);
  let raf = 0;
  let finished = false;
  let renderError = null;

  try {
    recorder.start(500);
    await wait(120, signal);
    const began = performance.now();
    audioSource?.start();
    onProgress?.(0);

    await new Promise((resolve, reject) => {
      let cursor = 0;
      const tick = (now) => {
        if (signal?.aborted) {
          reject(abortError());
          return;
        }
        const elapsed = Math.max(0, Math.round(now - began));
        try {
          while (cursor < ordered.length && Number(ordered[cursor].t) <= elapsed) {
            applyEvent?.(cloneJson(ordered[cursor]));
            cursor += 1;
          }
        } catch (error) {
          reject(error);
          return;
        }
        onProgress?.(Math.min(1, elapsed / durationMs));
        if (elapsed >= durationMs) {
          while (cursor < ordered.length) {
            applyEvent?.(cloneJson(ordered[cursor]));
            cursor += 1;
          }
          resolve();
          return;
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });

    await wait(180, signal);
    finished = true;
  } catch (error) {
    renderError = error;
  } finally {
    if (raf) cancelAnimationFrame(raf);
    try { audioSource?.stop(); } catch {}
    if (recorder.state !== 'inactive') {
      try { recorder.requestData(); } catch {}
      try { recorder.stop(); } catch {}
    }
  }

  let recorderError = null;
  try {
    await stopped;
  } catch (error) {
    recorderError = error;
  } finally {
    cleanupTracks(outputStream);
    cleanupTracks(videoStream);
    await audioContext?.close().catch(() => {});
  }
  if (renderError) throw renderError;
  if (recorderError) throw recorderError;
  if (!finished) throw abortError();
  const blob = new Blob(chunks, { type: 'video/mp4' });
  if (!blob.size) throw exportError('CAPTURE_FAILED', 'The MP4 file was empty.');
  onProgress?.(1);
  return blob;
}

function cleanupTracks(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(abortError());
    }, { once: true });
  });
}

function exportError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function abortError() {
  return exportError('EXPORT_CANCELLED', 'MP4 export was cancelled.');
}

function cloneJson(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}
