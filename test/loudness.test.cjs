const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const rms = require('../js/loudness.js');
const tone = (amplitude, rate = 48000, seconds = 1) =>
  Float32Array.from(
    { length: rate * seconds },
    (_, i) => amplitude * Math.sin((2 * Math.PI * 1000 * i) / rate)
  );
const db = (data) =>
  10 * Math.log10(data.reduce((sum, v) => sum + v * v, 0) / data.length);

test('independent RMS agrees across levels and rates; silence and weak sections keep fixed gain', async () => {
  for (const rate of [22050, 44100, 48000, 96000]) {
    for (const amplitude of [0.01, 0.1, 0.98]) {
      const loud = tone(amplitude, rate);
      const quiet = tone(amplitude / 4, rate);
      const channel = new Float32Array(4 * rate);
      channel.set(loud, rate);
      channel.set(quiet, 2 * rate);
      const stats = await rms.analyze([channel], rate);
      assert.ok(
        Math.abs(
          stats.rmsDb -
            10 * Math.log10((amplitude ** 2 / 2 + amplitude ** 2 / 32) / 2)
        ) < 0.001
      );
      const result = await rms.normalize(
        [channel],
        rate,
        stats,
        'dynamic',
        -20
      );
      assert.equal(result.processed, null);
      const output = channel.map((v) => v * result.gain);
      assert.ok(
        Math.abs(db(output.subarray(rate, 3 * rate)) - result.targetDb) < 0.001
      );
      assert.ok(
        Math.abs(
          db(output.subarray(rate, 2 * rate)) -
            db(output.subarray(2 * rate, 3 * rate)) -
            20 * Math.log10(4)
        ) < 0.001
      );
      assert.ok(output.subarray(0, rate).every((v) => v === 0));
      assert.ok(
        Math.max(...output.subarray(rate, rate + 1000).map(Math.abs)) <=
          10 ** (-6 / 20) + 1e-6
      );
    }
  }
});

test('standard peak limiting is linked, at most 1 dB, and independently within target tolerance', async () => {
  const left = tone(0.03);
  left[24000] = 0.95;
  const right = left.map((v) => v * 0.5);
  const stats = await rms.analyze([left, right], 48000);
  const standard = await rms.normalize(
    [left, right],
    48000,
    stats,
    'standard',
    -20
  );
  const dynamic = await rms.normalize(
    [left, right],
    48000,
    stats,
    'dynamic',
    -20
  );
  assert.ok(standard.processed);
  assert.ok(standard.reductionDb <= 1 + 1e-6);
  assert.ok(standard.reductionDb > 0.99);
  const independent =
    10 *
    Math.log10(
      (10 ** (db(standard.processed[0]) / 10) +
        10 ** (db(standard.processed[1]) / 10)) /
        2
    );
  assert.ok(Math.abs(independent - standard.targetDb) < 0.5);
  assert.ok(standard.targetDb >= dynamic.targetDb);
  standard.processed[0].forEach((v, i) => {
    assert.ok(Math.abs(v * 0.5 - standard.processed[1][i]) < 1e-7);
    assert.ok(Math.abs(v) <= 10 ** (-6 / 20) + 1e-6);
  });
  const next = await rms.normalize(
    [tone(0.01)],
    48000,
    await rms.analyze([tone(0.01)], 48000),
    'dynamic',
    dynamic.targetDb
  );
  assert.equal(next.targetDb, dynamic.targetDb);
});

test('no signal, nonfinite samples, cancellation and maximum boost are explicit', async () => {
  await assert.rejects(rms.analyze([new Float32Array(48000)], 48000), {
    code: 'NO_SIGNAL',
  });
  await assert.rejects(rms.analyze([Float32Array.of(NaN)], 48000), {
    code: 'UNSUPPORTED_AUDIO',
  });
  await assert.rejects(
    rms.analyze([tone(0.2)], 48000, () => false),
    { code: 'CANCELLED' }
  );
  const channel = tone(0.0015);
  const result = await rms.normalize(
    [channel],
    48000,
    await rms.analyze([channel], 48000),
    'dynamic',
    -20
  );
  assert.ok(result.gainDb <= 24);
});

function harness(savedSettings) {
  const tasks = [];
  const events = [];
  const storage = new Map();
  if (savedSettings !== undefined)
    storage.set('loudness-settings', JSON.stringify(savedSettings));
  class Audio {
    constructor(options) {
      this.options = options;
      this.pos = 0;
      this.active = false;
    }
    play() {
      this.active = true;
    }
    pause() {
      this.active = false;
    }
    stop() {
      this.active = false;
    }
    unload() {
      this.active = false;
    }
    playing() {
      return this.active;
    }
    duration() {
      return 30;
    }
    seek(value) {
      if (value !== undefined) this.pos = value;
      return this.pos;
    }
    setMaster(volume, muted) {
      this.master = muted ? 0 : volume;
    }
  }
  class BufferAudio extends Audio {
    constructor(...args) {
      super(...args);
      this.normalized = true;
    }
  }
  class Normalizer {
    constructor() {
      this.context = {};
      this.targets = { standard: -20, dynamic: -20 };
    }
    cancel() {}
    dropDecoded() {}
    prepare(...args) {
      return new Promise((resolve, reject) =>
        tasks.push({ args, resolve, reject })
      );
    }
  }
  let volume = 1;
  const context = vm.createContext({
    window: {
      listen1Desktop: {},
      localStorage: {
        getItem: (key) => storage.get(key),
        setItem: (key, value) => storage.set(key, value),
      },
      listen1NormalizedAudio: {
        Normalizer,
        BufferAudio,
        skipped: new Set(['NO_SIGNAL']),
      },
    },
    navigator: {},
    setInterval: () => 0,
    clearInterval() {},
    setTimeout: () => 0,
    clearTimeout() {},
    Howl: Audio,
    Howler: {
      _muted: false,
      volume(value) {
        if (value !== undefined) volume = value;
        return volume;
      },
      mute(value) {
        this._muted = value;
      },
    },
    playerSendMessage: (_, event) => events.push(event),
    MediaService: {
      bootstrapTrack() {
        throw new Error('unexpected request');
      },
    },
  });
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, '../js/player_thread.js'), 'utf8'),
    context
  );
  const player = context.window.threadPlayer;
  const restored = { ...player.loudness };
  player.setNewPlaylist([{ id: 'a' }, { id: 'b' }]);
  player.setMediaURI('https://x/a', 'a');
  player.setMediaURI('https://x/b', 'b');
  return { player, tasks, storage, events, restored };
}
const settle = async (
  task,
  mode = 'standard',
  source = 'https://x/a',
  targetDb = -20
) => {
  task.resolve({
    targetDb,
    mode,
    source,
    gainDb: 2,
    outputDb: targetDb,
    reductionDb: 0,
  });
  await new Promise((resolve) => setImmediate(resolve));
};

test('analysis pause, seeking, queue insertion, master volume and mute remain independent', async () => {
  const { player, tasks, storage } = harness();
  player.setLoudness({ enabled: true, mode: 'standard' });
  player.play(0);
  player.appendAudioList([{ id: 'c' }]);
  assert.equal(tasks.length, 1);
  player.seek(0.5);
  player.pause();
  await settle(tasks[0]);
  assert.equal(player.playing, false);
  assert.equal(player.currentHowl.seek(), 15);
  player.play();
  assert.equal(player.playing, true);
  assert.equal(tasks.length, 1);
  player.volume = 0.1;
  assert.equal(player.currentHowl.master, 0.1);
  assert.equal(player.loudness.gainDb, 2);
  player.mute();
  assert.equal(player.currentHowl.master, 0);
  player.unmute();
  player.volume = 0;
  assert.equal(player.currentHowl.master, 0);
  assert.deepEqual(JSON.parse(storage.get('loudness-settings')), {
    enabled: true,
    mode: 'standard',
  });
});

test('saved mode and enabled state restore without starting analysis or playback', () => {
  const pendingPause = harness();
  pendingPause.player._pending = { playNow: false, task: { cancel() {} } };
  pendingPause.player.setLoudness({ enabled: true, mode: 'standard' });
  assert.equal(pendingPause.tasks.length, 0);
  const { restored, tasks, player } = harness({
    enabled: true,
    mode: 'dynamic',
  });
  assert.deepEqual(restored, {
    enabled: true,
    mode: 'dynamic',
    status: 'idle',
  });
  assert.equal(tasks.length, 0);
  assert.equal(player.playing, false);
  const disabled = harness({ enabled: false, mode: 'dynamic' });
  assert.deepEqual(disabled.restored, {
    enabled: false,
    mode: 'dynamic',
    status: 'off',
  });
  assert.deepEqual(harness().restored, {
    enabled: false,
    mode: 'standard',
    status: 'off',
  });
});

test('late results cannot start old tracks, change targets, or survive mode change and clearing', async () => {
  const { player, tasks } = harness();
  player.setLoudness({ enabled: true, mode: 'standard' });
  player.play(0);
  player.play(1);
  await settle(tasks[0], 'standard', 'https://x/a', -40);
  assert.equal(player.currentHowl, null);
  assert.equal(player._normalizer.targets.standard, -20);
  player.setLoudness({ enabled: true, mode: 'dynamic' });
  await settle(tasks[1], 'standard', 'https://x/b', -30);
  assert.equal(player.currentHowl, null);
  player.clearPlaylist();
  await settle(tasks[2], 'dynamic', 'https://x/b', -30);
  assert.equal(player.playing, false);
  assert.equal(player._normalizer.targets.dynamic, -20);
});

test('confirmed unsupported skips; failure stays paused until explicit retry or disabling', async () => {
  const { player, tasks } = harness();
  player.setLoudness({ enabled: true, mode: 'standard' });
  player.play(0);
  tasks[0].reject(Object.assign(new Error(), { code: 'NETWORK_ERROR' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(player.loudness.status, 'error');
  assert.equal(player.playing, false);
  player.play();
  tasks[1].reject(Object.assign(new Error(), { code: 'NO_SIGNAL' }));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(player.loudness.status, 'skipped');
  assert.equal(player.playing, true);
  player.setLoudness({ enabled: false, mode: 'dynamic' });
  assert.equal(player.loudness.status, 'off');
  assert.equal(player.playing, true);
});

test('replacement of the actual source invalidates analysis while preserving pause and seek intent', async () => {
  const { player, tasks } = harness();
  player.setLoudness({ enabled: true, mode: 'standard' });
  player.play(0);
  player.seekTime(7);
  player.pause();
  player.setMediaURI('https://x/replacement', 'a');
  await settle(tasks[0], 'standard', 'https://x/a', -40);
  assert.equal(player.currentHowl, null);
  await settle(tasks[1], 'standard', 'https://x/replacement');
  assert.equal(player.playing, false);
  assert.equal(player.currentHowl.seek(), 7);
  assert.equal(player._normalizer.targets.standard, -20);
});

test('desktop preparation retries once and reuses measurement after re-decoding an identical fingerprint', async () => {
  const channels = [tone(0.1)];
  const stats = await rms.analyze(channels, 48000);
  let requests = 0;
  let scans = 0;
  let decodes = 0;
  let releases = 0;
  const buffer = {
    numberOfChannels: 1,
    length: 48000,
    sampleRate: 48000,
    getChannelData: () => channels[0],
  };
  class Context {
    resume() {
      return Promise.resolve();
    }
    decodeAudioData() {
      decodes += 1;
      return Promise.resolve(buffer);
    }
  }
  const context = vm.createContext({
    window: {
      listen1Rms: {
        ...rms,
        analyze: async () => {
          scans += 1;
          return stats;
        },
      },
      listen1Desktop: {
        prepareAudioSource: async () => {
          requests += 1;
          return requests === 1
            ? { error: 'NETWORK_ERROR' }
            : { assetId: 'asset', fingerprint: 'same', byteLength: 1 };
        },
        readAudioSource: async () => Uint8Array.of(1),
        releaseAudioSource: async () => {
          releases += 1;
        },
        cancelAudioPreparation: async () => {},
      },
    },
    AudioContext: Context,
    performance,
    Date,
    setTimeout,
    queueMicrotask,
  });
  vm.runInContext(
    fs.readFileSync(
      path.resolve(__dirname, '../js/normalized_audio.js'),
      'utf8'
    ),
    context
  );
  const normalizer = new context.window.listen1NormalizedAudio.Normalizer();
  const first = await normalizer.prepare(
    { id: 'a' },
    'url',
    'dynamic',
    () => true,
    () => {}
  );
  assert.equal(requests, 2);
  assert.equal(first.timings.cacheHit, false);
  normalizer.dropDecoded();
  const second = await normalizer.prepare(
    { id: 'a' },
    'url',
    'dynamic',
    () => true,
    () => {}
  );
  assert.equal(second.timings.cacheHit, true);
  assert.equal(second.timings.scanMs, 0);
  assert.equal(scans, 1);
  assert.equal(decodes, 2);
  assert.equal(releases, 2);
});

test('mute and volume zero also silence a retiring transport during its stop ramp', async () => {
  const context = {
    currentTime: 0,
    destination: {},
    resume: async () => {},
    createGain: () => ({
      connected: true,
      gain: {
        value: 1,
        cancelScheduledValues() {},
        setValueAtTime() {},
        linearRampToValueAtTime() {},
      },
      connect() {},
      disconnect() {
        this.connected = false;
      },
    }),
    createBufferSource: () => ({
      connect() {},
      disconnect() {},
      start() {},
      stop() {},
    }),
  };
  const sandbox = vm.createContext({
    window: { listen1Rms: rms },
    setTimeout,
    queueMicrotask,
  });
  vm.runInContext(
    fs.readFileSync(
      path.resolve(__dirname, '../js/normalized_audio.js'),
      'utf8'
    ),
    sandbox
  );
  const api = sandbox.window.listen1NormalizedAudio;
  const options = {
    onload() {},
    onplay() {},
    onpause() {},
    onstop() {},
    onend() {},
    onplayerror() {},
  };
  const old = new api.BufferAudio(
    options,
    { buffer: { duration: 10 }, gain: 2 },
    context,
    0.5,
    false
  );
  await old.play();
  context.currentTime = 0.5;
  old.unload();
  const current = new api.BufferAudio(
    options,
    { buffer: { duration: 10 }, gain: 3 },
    context,
    0.5,
    false
  );
  api.syncMaster(0.5, true);
  assert.equal(old.master.gain.value, 0);
  assert.equal(current.master.gain.value, 0);
  api.syncMaster(0, false);
  assert.equal(old.master.gain.value, 0);
  assert.equal(current.master.gain.value, 0);
  assert.equal(current.gain.gain.value, 3);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(old.master.connected, false);
  api.syncMaster(0.8, false);
  assert.equal(old.master.gain.value, 0);
  assert.equal(current.master.gain.value, 0.8);
  current.unload();
});
