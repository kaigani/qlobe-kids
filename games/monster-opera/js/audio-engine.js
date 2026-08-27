const AudioContextClass = () => window.AudioContext || window.webkitAudioContext;

export class MonsterAudioEngine {
  constructor() {
    this.context = null;
    this.master = null;
    this.beatGain = null;
    this.sampleGain = null;
    this.compressor = null;
    this.buffers = new Map();
    this.loading = new Map();
    this.voices = new Set();
    this.beatSource = null;
    this.beatUrl = null;
    this.muted = false;
    this.beatEnabled = true;
    this.destroyed = false;
    this.errors = [];
    this.log = [];
  }

  ensureContext() {
    if (this.context || this.destroyed) return this.context;
    const Ctor = AudioContextClass();
    if (!Ctor) return null;
    const context = new Ctor({ latencyHint: 'interactive' });
    const master = context.createGain();
    const beatGain = context.createGain();
    const sampleGain = context.createGain();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 16;
    compressor.ratio.value = 8;
    compressor.attack.value = 0.004;
    compressor.release.value = 0.22;
    beatGain.gain.value = this.beatEnabled ? 0.34 : 0;
    sampleGain.gain.value = 0.84;
    master.gain.value = this.muted ? 0 : 1;
    beatGain.connect(compressor);
    sampleGain.connect(compressor);
    compressor.connect(master);
    master.connect(context.destination);
    this.context = context;
    this.master = master;
    this.beatGain = beatGain;
    this.sampleGain = sampleGain;
    this.compressor = compressor;
    return context;
  }

  async unlock() {
    const context = this.ensureContext();
    if (!context) return false;
    try {
      if (context.state !== 'running') await context.resume();
      const buffer = context.createBuffer(1, 1, context.sampleRate);
      const source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.master);
      source.start(0);
      return context.state === 'running';
    } catch (error) {
      this.recordError('unlock', error);
      return false;
    }
  }

  async load(url) {
    if (this.buffers.has(url)) return this.buffers.get(url);
    if (this.loading.has(url)) return this.loading.get(url);
    const task = (async () => {
      const context = this.ensureContext();
      if (!context) throw new Error('Web Audio is unavailable');
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bytes = await response.arrayBuffer();
      const buffer = await context.decodeAudioData(bytes.slice(0));
      this.buffers.set(url, buffer);
      return buffer;
    })().catch((error) => {
      this.recordError(url, error);
      throw error;
    }).finally(() => this.loading.delete(url));
    this.loading.set(url, task);
    return task;
  }

  async preload(urls) {
    const unique = [...new Set(urls.filter(Boolean))];
    return Promise.allSettled(unique.map((url) => this.load(url)));
  }

  async startBeat(url) {
    this.beatUrl = url;
    if (this.beatSource || this.destroyed) return this.beatSource;
    try {
      const buffer = await this.load(url);
      if (this.beatSource || this.destroyed) return this.beatSource;
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this.beatGain);
      source.start();
      this.beatSource = source;
      source.onended = () => { if (this.beatSource === source) this.beatSource = null; };
      return source;
    } catch {
      return null;
    }
  }

  setMuted(on) {
    this.muted = Boolean(on);
    if (this.master && this.context) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 1, this.context.currentTime, 0.025);
    }
    return this.muted;
  }

  setBeatEnabled(on) {
    this.beatEnabled = Boolean(on);
    if (this.beatGain && this.context) {
      this.beatGain.gain.setTargetAtTime(this.beatEnabled ? 0.34 : 0, this.context.currentTime, 0.025);
    }
    if (this.beatEnabled && this.beatUrl && !this.beatSource) this.startBeat(this.beatUrl);
    return this.beatEnabled;
  }

  async play(url, options = {}) {
    const meta = {
      kind: options.kind || 'preview',
      monsterId: options.monsterId || null,
      laneId: options.laneId || null,
      eventId: options.eventId || null,
      url,
      at: Date.now(),
    };
    this.log.push(meta);
    if (this.log.length > 240) this.log.splice(0, this.log.length - 240);
    if (this.destroyed || this.muted) return null;
    try {
      const buffer = await this.load(url);
      const context = this.ensureContext();
      if (!context || this.destroyed || this.muted) return null;
      if (context.state !== 'running') await context.resume().catch(() => {});
      const source = context.createBufferSource();
      const gain = context.createGain();
      gain.gain.value = Math.max(0, Math.min(1, options.gain ?? 0.78));
      source.buffer = buffer;
      source.connect(gain);
      gain.connect(this.sampleGain);
      const voice = { source, gain, kind: meta.kind, eventId: meta.eventId };
      this.voices.add(voice);
      source.onended = () => this.voices.delete(voice);
      const requestedWhen = Number(options.when);
      if (meta.kind === 'scheduled' && Number.isFinite(requestedWhen) && requestedWhen < context.currentTime - 0.075) {
        this.voices.delete(voice);
        source.disconnect();
        gain.disconnect();
        meta.skipped = 'late';
        return null;
      }
      const when = Math.max(context.currentTime, requestedWhen || context.currentTime);
      source.start(when);
      meta.contextTime = when;
      return voice;
    } catch {
      return null;
    }
  }

  stopVoices(kind = null) {
    for (const voice of [...this.voices]) {
      if (kind && voice.kind !== kind) continue;
      try { voice.source.stop(); } catch { /* already ended */ }
      this.voices.delete(voice);
    }
  }

  stop() {
    this.stopVoices();
    if (this.beatSource) {
      try { this.beatSource.stop(); } catch { /* already ended */ }
      this.beatSource = null;
    }
  }

  stats() {
    return {
      contextState: this.context?.state || 'uninitialized',
      muted: this.muted,
      beatEnabled: this.beatEnabled,
      beatPlaying: Boolean(this.beatSource),
      loaded: this.buffers.size,
      loading: this.loading.size,
      voices: this.voices.size,
      errors: [...this.errors],
    };
  }

  getAudioLog() { return this.log.map((entry) => ({ ...entry })); }

  recordError(source, error) {
    const detail = `${source}: ${error?.message || error}`;
    if (!this.errors.includes(detail)) this.errors.push(detail);
    if (this.errors.length > 30) this.errors.shift();
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stop();
    this.context?.close().catch(() => {});
  }
}
