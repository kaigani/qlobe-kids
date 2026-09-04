// sprite-clips.js — decode-on-demand keyframe animation from WebP strips.
//
// Plays clips produced by `tools/video-to-sprite-strips.py`: every source
// frame of a video, keyed to real alpha, packed eight-per-file into horizontal
// strips. A clip is drawn onto a plain 2D canvas with `drawImage`, so it
// composites onto any background with no blend modes and no <video> element.
//
// Memory is the design constraint. A four-second chalk clip is ~90 frames of
// 480² RGBA — far too much to hold decoded for a dozen dancers at once — so a
// player only ever holds the strip it is drawing plus the next one. Strips
// are decoded off the main thread with `createImageBitmap` and closed as soon
// as no player wants them. Compressed strip bytes stay cached as Blobs so a
// loop re-decodes from memory, never from the network.
//
// Time, not frame counting, drives playback: frame = floor(elapsed × fps).
// Looping clips share one epoch per clip, so every copy of a monster's dance
// shows the same frame and shares the same decoded strips.

const MiB = 1024 * 1024;

/** Simple priority queue for network fetches: highest priority first, FIFO within. */
function createFetchQueue(concurrency) {
  const pending = [];
  let active = 0;
  const pump = () => {
    while (active < concurrency && pending.length) {
      pending.sort((a, b) => b.priority - a.priority || a.serial - b.serial);
      const job = pending.shift();
      active += 1;
      job.run().finally(() => {
        active -= 1;
        pump();
      });
    }
  };
  let serial = 0;
  return {
    add(run, priority = 0) {
      pending.push({ run, priority, serial: serial++ });
      pump();
    },
    bump(run, priority) {
      const job = pending.find((item) => item.run === run);
      if (job && job.priority < priority) job.priority = priority;
    },
    get size() { return pending.length + active; },
    get active() { return active; },
  };
}

async function decodeBlob(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch { /* fall through to the <img> path */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    await image.decode();
    image.close = () => { image.src = ''; };
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * @param {object} [options]
 * @param {number} [options.decodedBudgetBytes] soft cap on decoded strip memory
 * @param {number} [options.blobBudgetBytes]    soft cap on cached compressed bytes
 * @param {number} [options.fetchConcurrency]
 * @param {(error: Error, url: string) => void} [options.onError]
 */
export function createSpriteLibrary({
  decodedBudgetBytes = 192 * MiB,
  blobBudgetBytes = 320 * MiB,
  fetchConcurrency = 6,
  onError = () => {},
} = {}) {
  const manifests = new Map();
  const clips = new Map();
  const players = new Set();
  const queue = createFetchQueue(fetchConcurrency);
  const epoch = performance.now();
  let frame = 0;
  let decodedBytes = 0;
  let blobBytes = 0;
  let decodesInFlight = 0;
  let paints = 0;

  function loadManifest(url) {
    const key = new URL(url, location.href).href;
    if (!manifests.has(key)) {
      manifests.set(key, fetch(key).then(async (response) => {
        if (!response.ok) throw new Error(`sprite manifest ${response.status}: ${key}`);
        const manifest = await response.json();
        if (manifest.format !== 'qlobe-sprite-strips/1') throw new Error(`unknown sprite manifest format: ${manifest.format}`);
        manifest.url = key;
        manifest.base = key.slice(0, key.lastIndexOf('/') + 1);
        return manifest;
      }).catch((error) => {
        manifests.delete(key);
        onError(error, key);
        throw error;
      }));
    }
    return manifests.get(key);
  }

  function makeClip(manifest, name) {
    const spec = manifest.clips?.[name];
    if (!spec) throw new Error(`sprite clip ${name} missing from ${manifest.url}`);
    const clip = {
      id: `${manifest.url}#${name}`,
      name,
      fps: spec.fps,
      frames: spec.frames,
      duration: spec.frames / spec.fps,
      loop: Boolean(spec.loop),
      crop: spec.crop,
      frameBox: manifest.frameBox,
      framesPerStrip: spec.framesPerStrip,
      sequence: spec.sequence || null,
      stored: spec.stored ?? spec.frames,
      strips: spec.strips.map((file) => ({
        url: manifest.base + file,
        blob: null,
        blobPromise: null,
        bitmap: null,
        bitmapPromise: null,
        bytes: 0,
        wantedAt: 0,
        fetchJob: null,
        failed: false,
      })),
      fetched: 0,
      lastUsed: 0,
      users: 0,
    };
    clip.bytesPerStrip = spec.crop.width * spec.crop.height * 4 * spec.framesPerStrip;
    return clip;
  }

  /** Resolve a clip by manifest URL and clip name; cached per pair. */
  async function clip(manifestUrl, name) {
    const manifest = await loadManifest(manifestUrl);
    const id = `${manifest.url}#${name}`;
    if (!clips.has(id)) clips.set(id, makeClip(manifest, name));
    return clips.get(id);
  }

  function storedIndex(clipRef, playbackFrame) {
    return clipRef.sequence ? clipRef.sequence[playbackFrame] : playbackFrame;
  }

  function stripCount(clipRef) {
    return clipRef.strips.length;
  }

  function fetchStrip(clipRef, index, priority = 0) {
    const strip = clipRef.strips[index];
    if (!strip || strip.failed) return Promise.resolve(null);
    if (strip.blob) return Promise.resolve(strip.blob);
    if (strip.blobPromise) {
      queue.bump(strip.fetchJob, priority);
      return strip.blobPromise;
    }
    strip.blobPromise = new Promise((resolve) => {
      strip.fetchJob = async () => {
        try {
          const response = await fetch(strip.url);
          if (!response.ok) throw new Error(`sprite strip ${response.status}: ${strip.url}`);
          const blob = await response.blob();
          strip.blob = blob;
          blobBytes += blob.size;
          clipRef.fetched += 1;
          resolve(blob);
        } catch (error) {
          strip.failed = true; // a missing strip is reported once, not re-requested every frame
          onError(error, strip.url);
          resolve(null);
        } finally {
          strip.blobPromise = null;
          strip.fetchJob = null;
        }
      };
      queue.add(strip.fetchJob, priority);
    });
    return strip.blobPromise;
  }

  /** Fetch every strip of a clip into memory (compressed). Resolves when done. */
  function prefetch(clipRef, priority = 0) {
    clipRef.lastUsed = performance.now();
    return Promise.all(clipRef.strips.map((_, index) => fetchStrip(clipRef, index, priority))).then(() => clipRef);
  }

  /** Decode one strip (fetching first if needed). Resolves to the drawable or null. */
  function decodeStrip(clipRef, index, priority = 1) {
    const strip = clipRef.strips[index];
    if (!strip) return Promise.resolve(null);
    strip.wantedAt = performance.now();
    if (strip.bitmap) return Promise.resolve(strip.bitmap);
    if (strip.bitmapPromise) return strip.bitmapPromise;
    strip.bitmapPromise = fetchStrip(clipRef, index, priority).then(async (blob) => {
      if (!blob) return null;
      decodesInFlight += 1;
      try {
        const bitmap = await decodeBlob(blob);
        strip.bitmap = bitmap;
        strip.bytes = clipRef.bytesPerStrip;
        decodedBytes += strip.bytes;
        // If nobody wanted it by the time it decoded, let the sweeper reclaim it.
        return bitmap;
      } catch (error) {
        onError(error, strip.url);
        return null;
      } finally {
        decodesInFlight -= 1;
        strip.bitmapPromise = null;
      }
    });
    return strip.bitmapPromise;
  }

  function closeStrip(strip) {
    if (!strip.bitmap) return;
    try { strip.bitmap.close?.(); } catch { /* already gone */ }
    decodedBytes -= strip.bytes;
    strip.bitmap = null;
    strip.bytes = 0;
  }

  function dropBlobs(clipRef) {
    for (const strip of clipRef.strips) {
      closeStrip(strip);
      if (strip.blob) {
        blobBytes -= strip.blob.size;
        strip.blob = null;
      }
    }
    clipRef.fetched = 0;
  }

  /** Forget a clip's cached bytes (compressed and decoded). Active players are unaffected until they stop. */
  function release(clipRef) {
    dropBlobs(clipRef);
  }

  // ---- players ------------------------------------------------------------

  function createPlayer(canvas, { scale = 1 } = {}) {
    const context = canvas.getContext('2d');
    const player = {
      canvas,
      context,
      scale,
      visible: true,
      idle: null,        // { clip, epoch }
      shot: null,        // { clip, startedAt, onStart, onEnd, started }
      current: null,     // clip being drawn
      drawnFrame: -1,
      drawnClip: null,
      ready: false,
      onReady: null,
      active: false,
      warm(clipRef, priority = 1) {
        if (clipRef?.strips.length) decodeStrip(clipRef, 0, priority);
      },
      /** Loop a clip in step with every other player looping the same clip. */
      loop(clipRef, { epoch: loopEpoch = epoch } = {}) {
        player.idle = clipRef ? { clip: clipRef, epoch: loopEpoch } : null;
        if (clipRef) {
          clipRef.lastUsed = performance.now();
          if (clipRef.fetched < clipRef.strips.length) prefetch(clipRef, 2);
        }
        activate();
        return player;
      },
      /** Play a clip once from now, then fall back to the idle loop. */
      play(clipRef, { onStart = null, onEnd = null } = {}) {
        player.cancel();
        clipRef.lastUsed = performance.now();
        player.shot = { clip: clipRef, startedAt: performance.now(), onStart, onEnd, started: false, done: false };
        prefetch(clipRef, 3);
        activate();
        const shot = player.shot;
        return () => {
          if (player.shot === shot) player.cancel();
        };
      },
      /** Stop a one-shot early without firing its onEnd. */
      cancel() {
        if (!player.shot) return;
        player.shot.done = true;
        player.shot = null;
        player.drawnFrame = -1;
      },
      setVisible(visible) {
        visible = Boolean(visible);
        if (player.visible === visible) return;
        player.visible = visible;
        if (!visible) {
          player.drawnFrame = -1;
          player.ready = false;
        }
        activate();
      },
      setScale(next) {
        if (player.scale === next) return;
        player.scale = next;
        player.drawnFrame = -1;
      },
      clear() {
        if (canvas.width > 1 && canvas.height > 1) context.clearRect(0, 0, canvas.width, canvas.height);
        player.drawnFrame = -1;
        player.ready = false;
      },
      stop() {
        player.cancel();
        player.idle = null;
        player.current = null;
        player.clear();
        activate();
      },
      destroy() {
        player.stop();
        players.delete(player);
      },
    };
    players.add(player);
    return player;
  }

  function frameAt(clipRef, elapsedMs) {
    const index = Math.floor(Math.max(0, elapsedMs) / 1000 * clipRef.fps);
    return clipRef.loop ? index % clipRef.frames : Math.min(index, clipRef.frames);
  }

  function paintPlayer(player, now) {
    const { canvas, context } = player;
    let clipRef = null;
    let playbackFrame = 0;
    if (player.shot) {
      const shot = player.shot;
      clipRef = shot.clip;
      playbackFrame = frameAt(clipRef, now - shot.startedAt);
      if (playbackFrame >= clipRef.frames) {
        shot.done = true;
        player.shot = null;
        player.drawnFrame = -1;
        shot.onEnd?.();
        clipRef = null;
      }
    }
    if (!clipRef && player.idle) {
      clipRef = player.idle.clip;
      if (clipRef.fetched < clipRef.strips.length) return; // not buffered yet; keep the still
      playbackFrame = frameAt(clipRef, now - player.idle.epoch);
    }
    if (!clipRef) return;
    if (player.current !== clipRef) {
      player.current = clipRef;
      player.drawnFrame = -1;
    }
    clipRef.lastUsed = now;
    const stored = storedIndex(clipRef, playbackFrame);
    const per = clipRef.framesPerStrip;
    const stripIndex = Math.floor(stored / per);
    const strips = stripCount(clipRef);
    const priority = player.shot ? 3 : 2;
    const current = clipRef.strips[stripIndex];
    current.wantedAt = now;
    // Decode the following strip only as this one nears its end (three frames
    // of lead is 125–150ms, ample for an off-thread decode), and never while
    // over budget, so a clip usually holds one decoded strip, briefly two.
    const column = stored - stripIndex * per;
    if ((stripIndex + 1 < strips || clipRef.loop) && column >= per - 3 && decodedBytes < decodedBudgetBytes) {
      const nextIndex = (stripIndex + 1) % strips;
      clipRef.strips[nextIndex].wantedAt = now;
      if (!clipRef.strips[nextIndex].bitmap) decodeStrip(clipRef, nextIndex, priority);
    }
    if (!current.bitmap) {
      decodeStrip(clipRef, stripIndex, priority);
      return;
    }
    if (player.drawnFrame === stored && player.drawnClip === clipRef) return;
    const width = Math.max(1, Math.round(clipRef.frameBox.width * player.scale));
    const height = Math.max(1, Math.round(clipRef.frameBox.height * player.scale));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const { crop } = clipRef;
    context.clearRect(0, 0, width, height);
    context.drawImage(
      current.bitmap,
      column * crop.width, 0, crop.width, crop.height,
      crop.x * player.scale, crop.y * player.scale, crop.width * player.scale, crop.height * player.scale,
    );
    paints += 1;
    player.drawnFrame = stored;
    player.drawnClip = clipRef;
    if (!player.ready) {
      player.ready = true;
      player.onReady?.();
    }
    if (player.shot && !player.shot.started) {
      player.shot.started = true;
      player.shot.onStart?.();
    }
  }

  function sweep(now) {
    // Close decoded strips nobody has wanted for a moment, and trim caches
    // above budget starting with the least recently used.
    const grace = 120;
    for (const clipRef of clips.values()) {
      for (const strip of clipRef.strips) {
        if (strip.bitmap && now - strip.wantedAt > grace) closeStrip(strip);
      }
    }
    if (decodedBytes > decodedBudgetBytes) {
      const candidates = [];
      for (const clipRef of clips.values()) {
        for (const strip of clipRef.strips) if (strip.bitmap) candidates.push(strip);
      }
      candidates.sort((a, b) => a.wantedAt - b.wantedAt);
      for (const strip of candidates) {
        if (decodedBytes <= decodedBudgetBytes || now - strip.wantedAt < 50) break;
        closeStrip(strip);
      }
    }
    if (blobBytes > blobBudgetBytes) {
      const inUse = new Set();
      for (const player of players) {
        if (player.idle) inUse.add(player.idle.clip);
        if (player.shot) inUse.add(player.shot.clip);
      }
      const idleClips = [...clips.values()].filter((item) => !inUse.has(item) && item.fetched > 0)
        .sort((a, b) => a.lastUsed - b.lastUsed);
      for (const clipRef of idleClips) {
        if (blobBytes <= blobBudgetBytes) break;
        dropBlobs(clipRef);
      }
    }
  }

  let lastSweep = 0;
  function tick(now) {
    frame = 0;
    let busy = false;
    for (const player of players) {
      if (!player.visible || (!player.idle && !player.shot)) continue;
      busy = true;
      paintPlayer(player, now);
    }
    if (now - lastSweep > 100) {
      lastSweep = now;
      sweep(now);
    }
    // Keep ticking while anything is showing or decoding; otherwise the next
    // loop()/play()/setVisible() call restarts the frame loop.
    if (busy || decodesInFlight > 0) frame = requestAnimationFrame(tick);
    else if (decodedBytes > 0) frame = requestAnimationFrame(tick); // let the sweeper close leftovers
  }

  function activate() {
    if (frame) return;
    frame = requestAnimationFrame(tick);
  }

  function stats() {
    let active = 0;
    let decoded = 0;
    for (const player of players) if (player.visible && (player.idle || player.shot)) active += 1;
    for (const clipRef of clips.values()) for (const strip of clipRef.strips) if (strip.bitmap) decoded += 1;
    return {
      players: players.size,
      activePlayers: active,
      clips: clips.size,
      decodedStrips: decoded,
      decodedMiB: Math.round(decodedBytes / MiB * 10) / 10,
      blobMiB: Math.round(blobBytes / MiB * 10) / 10,
      decodesInFlight,
      fetchesQueued: queue.size,
      paints,
    };
  }

  function destroy() {
    cancelAnimationFrame(frame);
    frame = 0;
    for (const player of [...players]) player.destroy();
    for (const clipRef of clips.values()) dropBlobs(clipRef);
    clips.clear();
    manifests.clear();
  }

  return {
    epoch,
    loadManifest,
    clip,
    prefetch,
    release,
    createPlayer,
    stats,
    destroy,
    /** Fetch + decode a clip's first strip so a one-shot can start instantly. */
    warm: (clipRef, priority = 1) => decodeStrip(clipRef, 0, priority),
  };
}
