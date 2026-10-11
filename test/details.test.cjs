const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function harness() {
  const registered = {};
  const queued = [];
  const listeners = {};
  const probes = [];
  const source = {
    trackId: 'netrack_a',
    url: 'https://qq.com/audio',
    platform: 'qq',
    identity: 1,
  };
  const context = vm.createContext({
    window: {
      listen1Desktop: {
        inspectAudioSource(input) {
          return new Promise((resolve) => probes.push({ input, resolve }));
        },
        cancelAudioInspection: async () => {},
        localCoverUrl: async () => 'file:///C:/copy.png',
      },
      Lyrics: { getProvenance: () => null },
    },
    i18next: { t: (key) => key, on() {}, off() {} },
    document: { activeElement: null, contains: () => false },
    l1Player: {
      getResolvedAudioSource: async () => ({ ...source }),
      onAudioSourceChanged(callback) {
        listeners.source = callback;
        return () => {};
      },
      updateTrackMetadata() {},
    },
    MediaService: {
      bootstrapTrack() {
        throw Error('loaded source must be reused');
      },
    },
    AbortController,
    setTimeout,
    clearTimeout,
    axios: {
      defaults: {},
      create: () => ({
        defaults: {},
        interceptors: { response: { use() {} } },
      }),
      interceptors: { response: { use() {} } },
    },
  });
  for (const name of ['request.js', 'track_details.js'])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '../js', name), 'utf8'),
      context
    );
  const app = {
    factory: (name, value) => {
      registered[name] = value.at(-1);
    },
    filter() {},
    directive: (name, value) => {
      registered[name] = value.at(-1);
    },
  };
  context.window.injectTrackDetails(app);
  const root = { $evalAsync: (fn) => queued.push(fn), $broadcast() {} };
  const presentation = registered.TrackPresentation(root);
  const scope = {
    $evalAsync: (fn) => queued.push(fn),
    $on: (name, fn) => {
      listeners[name] = fn;
    },
    $watch() {},
  };
  registered.trackDetails(root, () => {}, presentation).link(scope, [{}]);
  const flush = () => {
    while (queued.length) queued.shift()();
  };
  return { context, source, probes, listeners, presentation, scope, flush };
}

test('details inspect the actual loaded fallback without resolving or operating the queue', async () => {
  const { presentation, probes, source } = harness();
  const track = { id: 'netrack_a', source: 'netease' };
  const task = presentation.query(track);
  await tick();
  assert.equal(probes[0].input.url, source.url);
  assert.equal(probes[0].input.platform, 'qq');
  probes[0].resolve({ audioInfo: { codec: 'FLAC', lossless: true } });
  await task.promise;
  assert.equal((await presentation.cached(track)).audioInfo.codec, 'FLAC');
  source.identity += 1;
  assert.equal(await presentation.cached(track), null);
});

test('source replacement during a probe rejects the result and does not populate the cache', async () => {
  const { presentation, probes, source } = harness();
  const task = presentation.query({ id: 'netrack_a' });
  await tick();
  source.url = 'https://qq.com/new';
  source.identity += 1;
  probes[0].resolve({ audioInfo: { codec: 'old' } });
  await assert.rejects(task.promise, { code: 'SOURCE_CHANGED' });
  assert.equal(await presentation.cached({ id: 'netrack_a' }), null);
});

test('closing or switching details rejects results already queued for an Angular digest', async () => {
  const { listeners, scope, probes, flush } = harness();
  listeners['track-details:open'](null, { id: 'lmtrack_C:/a.wav', title: 'A' });
  await tick();
  probes[0].resolve({ audioInfo: { codec: 'old' } });
  await tick();
  listeners['track-details:open'](null, { id: 'netrack_b', title: 'B' });
  flush();
  assert.equal(scope.state.target.id, 'netrack_b');
  assert.equal(scope.state.info, undefined);
  scope.close();
  flush();
  assert.equal(scope.state.target, undefined);
});

test('late source events cannot clear a newly reopened target with the same ID', async () => {
  const { listeners, scope, probes, flush } = harness();
  listeners['track-details:open'](null, { id: 'lmtrack_C:/a.wav', title: 'A' });
  await tick();
  listeners.source({ id: 'lmtrack_C:/a.wav' });
  scope.close();
  listeners['track-details:open'](null, {
    id: 'lmtrack_C:/a.wav',
    title: 'A again',
  });
  await tick();
  probes[1].resolve({ audioInfo: { codec: 'PCM' } });
  await tick();
  flush();
  assert.equal(scope.state.target.title, 'A again');
  assert.equal(scope.state.info.audioInfo.codec, 'PCM');
  probes[0].resolve({ audioInfo: { codec: 'old' } });
  await tick();
  flush();
  assert.equal(scope.state.info.audioInfo.codec, 'PCM');
});
