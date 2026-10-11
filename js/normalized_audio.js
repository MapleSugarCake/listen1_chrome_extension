// Desktop-only preparation and AudioBuffer transport. Howler's private graph is
// deliberately not used; HTML5 fallback remains under its existing controls.
/* eslint-disable max-classes-per-file -- Preparation and its transport share one desktop adapter. */
/* eslint-disable no-await-in-loop -- IPC chunks and retry attempts must execute sequentially. */
(() => {
  let serial = 0;
  const transports = new Set();
  const Rms = window.listen1Rms;
  const skipped = new Set([
    'UNSUPPORTED_SOURCE',
    'UNSUPPORTED_AUDIO',
    'NO_SIGNAL',
    'CHANNEL_LAYOUT',
  ]);

  class BufferAudio {
    constructor(options, prepared, context, volume, muted) {
      this.options = options;
      this.buffer = prepared.buffer;
      this.context = context;
      this.normalized = true;
      this.position = 0;
      this.started = 0;
      this.token = 0;
      this.active = false;
      this.source = null;
      this.gain = context.createGain();
      this.master = context.createGain();
      this.gain.gain.value = prepared.gain;
      this.gain.connect(this.master);
      this.master.connect(context.destination);
      this.setMaster(volume, muted);
      transports.add(this);
      queueMicrotask(() => {
        if (this.buffer) this.options.onload();
      });
    }

    setMaster(volume, muted) {
      const parameter = this.master.gain;
      parameter.cancelScheduledValues(this.context.currentTime);
      // Master volume has no envelope; update its intrinsic value even when the
      // audio context is suspended, so a later resume uses the latest control.
      parameter.value = muted ? 0 : volume;
    }

    async play() {
      if (!this.buffer || this.active) return;
      this.token += 1;
      const { token } = this;
      try {
        await this.context.resume();
        if (!this.buffer || token !== this.token) return;
        if (this.position >= this.duration()) this.position = 0;
        const source = this.context.createBufferSource();
        source.buffer = this.buffer;
        const fade = this.context.createGain();
        source.connect(fade);
        fade.connect(this.gain);
        this.fade = fade;
        this.source = source;
        this.started = this.context.currentTime;
        this.active = true;
        const parameter = fade.gain;
        const remaining = this.duration() - this.position;
        const ramp = Math.min(0.015, remaining / 2);
        this.fadeDuration = remaining;
        this.fadeRamp = ramp;
        parameter.cancelScheduledValues(this.started);
        parameter.setValueAtTime(0, this.started);
        parameter.linearRampToValueAtTime(1, this.started + ramp);
        parameter.setValueAtTime(1, this.started + remaining - ramp);
        parameter.linearRampToValueAtTime(0, this.started + remaining);
        source.onended = () => {
          source.disconnect();
          fade.disconnect();
          if (!this.active || token !== this.token) return;
          this.active = false;
          this.position = this.duration();
          this.source = null;
          this.options.onend();
        };
        source.start(0, this.position);
        this.options.onplay();
      } catch {
        if (token === this.token)
          this.options.onplayerror(null, 'AUDIO_CONTEXT');
      }
    }

    halt() {
      this.position = this.seek();
      this.active = false;
      this.token += 1;
      if (this.source) {
        const { source } = this;
        this.source = null;
        const { fade } = this;
        source.onended = () => {
          source.disconnect();
          fade.disconnect();
        };
        const now = this.context.currentTime;
        const parameter = fade.gain;
        const elapsed = now - this.started;
        const value = Math.max(
          0,
          Math.min(
            1,
            elapsed / this.fadeRamp,
            (this.fadeDuration - elapsed) / this.fadeRamp
          )
        );
        parameter.cancelScheduledValues(now);
        parameter.linearRampToValueAtTime(value, now);
        parameter.linearRampToValueAtTime(0, now + 0.015);
        source.stop(now + 0.015);
      }
    }

    pause() {
      this.halt();
      this.options.onpause();
    }

    stop() {
      this.halt();
      this.position = 0;
      this.options.onstop();
    }

    unload() {
      this.halt();
      this.buffer = null;
      // Let the short stop ramp finish before disconnecting the output graph.
      setTimeout(() => {
        transports.delete(this);
        this.master.disconnect();
        this.gain.disconnect();
      }, 30);
    }

    playing() {
      return this.active;
    }

    duration() {
      return this.buffer ? this.buffer.duration : 0;
    }

    // eslint-disable-next-line class-methods-use-this -- Existing transport contract.
    rate() {
      return 1;
    }

    seek(value) {
      if (value === undefined)
        return Math.min(
          this.duration(),
          this.position +
            (this.active ? this.context.currentTime - this.started : 0)
        );
      const resume = this.active;
      this.halt();
      this.position = Math.max(
        0,
        Math.min(this.duration(), Number(value) || 0)
      );
      if (resume) this.play();
      return this.position;
    }
  }

  class Normalizer {
    constructor() {
      this.context = new AudioContext();
      this.targets = { standard: Rms.REFERENCE_DB, dynamic: Rms.REFERENCE_DB };
      this.cached = null;
      this.measurements = new Map();
      this.pendingId = null;
    }

    cancel() {
      if (this.pendingId)
        window.listen1Desktop
          .cancelAudioPreparation(this.pendingId)
          .catch(() => {});
      this.pendingId = null;
    }

    dropDecoded() {
      this.cached = null;
    }

    async prepare(track, url, mode, isCurrent, onPhase) {
      const started = performance.now();
      const timings = { decodeMs: 0, scanMs: 0, processMs: 0, cacheHit: false };
      const bridge = window.listen1Desktop;
      // Start resuming within the initiating gesture; do not produce sound yet.
      this.context.resume().catch(() => {});
      serial += 1;
      const requestId = `rms-${Date.now()}-${serial}`;
      this.pendingId = requestId;
      let asset;
      try {
        onPhase('reading');
        for (let attempt = 0; attempt < 2; attempt += 1) {
          asset = await bridge.prepareAudioSource({
            requestId,
            trackId: track.id,
            platform: track.platform || track.source,
            url,
          });
          if (!isCurrent()) throw Rms.error('CANCELLED');
          if (
            !['NETWORK_ERROR', 'SOURCE_CHANGED', 'FILE_MISSING'].includes(
              asset.error
            )
          )
            break;
        }
        if (asset.error) throw Rms.error(asset.error);
        timings.readMs = performance.now() - started;
        let { cached } = this;
        timings.cacheHit = this.measurements.has(asset.fingerprint);
        if (!cached || cached.fingerprint !== asset.fingerprint) {
          this.cached = null;
          onPhase('decoding');
          const bytes = new Uint8Array(asset.byteLength);
          for (let offset = 0; offset < bytes.length; offset += 1048576) {
            if (!isCurrent()) throw Rms.error('CANCELLED');
            const part = await bridge.readAudioSource({
              assetId: asset.assetId,
              offset,
              length: Math.min(1048576, bytes.length - offset),
            });
            bytes.set(part, offset);
          }
          let buffer;
          const decodeStarted = performance.now();
          try {
            buffer = await this.context.decodeAudioData(bytes.buffer);
          } catch {
            throw Rms.error('UNSUPPORTED_AUDIO');
          }
          timings.decodeMs = performance.now() - decodeStarted;
          if (!isCurrent()) throw Rms.error('CANCELLED');
          if (buffer.numberOfChannels > 2) throw Rms.error('CHANNEL_LAYOUT');
          if (buffer.length * buffer.numberOfChannels * 4 > 256 * 1048576)
            throw Rms.error('RESOURCE_LIMIT');
          const channels = Array.from(
            { length: buffer.numberOfChannels },
            (_, i) => buffer.getChannelData(i)
          );
          onPhase('analyzing');
          const scanStarted = performance.now();
          const stats =
            this.measurements.get(asset.fingerprint) ||
            (await Rms.analyze(channels, buffer.sampleRate, isCurrent));
          timings.scanMs = timings.cacheHit
            ? 0
            : performance.now() - scanStarted;
          this.measurements.delete(asset.fingerprint);
          this.measurements.set(asset.fingerprint, stats);
          if (this.measurements.size > 128)
            this.measurements.delete(this.measurements.keys().next().value);
          cached = { fingerprint: asset.fingerprint, buffer, channels, stats };
          if (!isCurrent()) throw Rms.error('CANCELLED');
          this.cached = cached;
        }
        onPhase('preparing');
        const processStarted = performance.now();
        const prepared = await Rms.normalize(
          cached.channels,
          cached.buffer.sampleRate,
          cached.stats,
          mode,
          this.targets[mode],
          isCurrent
        );
        let { buffer } = cached;
        if (prepared.processed) {
          buffer = this.context.createBuffer(
            prepared.processed.length,
            cached.buffer.length,
            cached.buffer.sampleRate
          );
          prepared.processed.forEach((channel, i) =>
            buffer.copyToChannel(channel, i)
          );
        }
        if (!isCurrent()) throw Rms.error('CANCELLED');
        timings.processMs = performance.now() - processStarted;
        timings.totalMs = performance.now() - started;
        return {
          ...prepared,
          processed: undefined,
          buffer,
          fingerprint: asset.fingerprint,
          inputDb: cached.stats.rmsDb,
          inputPeak: cached.stats.peak,
          source: url,
          mode,
          timings,
        };
      } finally {
        if (asset?.assetId)
          await bridge.releaseAudioSource(asset.assetId).catch(() => {});
        if (this.pendingId === requestId) this.pendingId = null;
      }
    }
  }
  window.listen1NormalizedAudio = {
    Normalizer,
    BufferAudio,
    skipped,
    syncMaster(volume, muted) {
      transports.forEach((transport) => transport.setMaster(volume, muted));
    },
  };
})();
