const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness(overrides = {}) {
  const empty = {
    search: () => ({ success: (fn) => fn({ result: [], total: 0, type: 0 }) }),
    bootstrap_track: (track, success, fail) => fail({ code: 'UNAVAILABLE' }),
  };
  const context = vm.createContext({
    AbortController,
    URLSearchParams,
    Promise,
    console,
    clearTimeout,
    setTimeout: (fn, ms) => setTimeout(fn, ms / 100),
    LRUCache: class {
      get() {}
      set() {}
    },
    setPrototypeOfLocalStorage() {},
    localStorage: { getObject: () => true },
    getLocalStorageValue: () => ['qq', 'kuwo', 'migu'],
    ...Object.fromEntries(
      [
        'netease',
        'xiami',
        'qq',
        'kugou',
        'kuwo',
        'bilibili',
        'migu',
        'taihe',
        'localmusic',
        'myplaylist',
      ].map((name) => [name, empty])
    ),
    ...overrides,
  });
  for (const file of ['request.js', 'loweb.js'])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, '../js', file), 'utf8'),
      context
    );
  return vm.runInContext('({ RequestTask, MediaService })', context);
}

test('aggregation publishes successes before a stalled provider and finishes', async () => {
  const { MediaService } = harness({
    netease: {
      search: () => ({
        success: (fn) =>
          fn({ result: [{ id: 'netrack_1', source: 'netease' }], total: 1 }),
      }),
    },
    qq: { search: () => ({ success() {} }) },
  });
  const updates = [];
  const task = MediaService.search('allmusic', {
    keywords: 'song',
    curpage: 1,
    type: 0,
  }).onProgress((value) => updates.push(value));
  const result = await task.promise;
  assert.ok(
    updates.some(
      (value) =>
        value.result.length === 1 && value.sources.qq.state === 'pending'
    )
  );
  assert.equal(result.result.length, 1);
  assert.equal(result.sources.qq.state, 'error');
  assert.equal(result.sources.qq.code, 'TIMEOUT');
});

test('cancellation aborts the operation and ignores late success', async () => {
  const { RequestTask } = harness();
  let finish,
    signal,
    called = false;
  const task = RequestTask.create((context) => {
    finish = context.resolve;
    signal = context.signal;
  });
  task.success(() => {
    called = true;
  });
  task.cancel();
  finish('late');
  await assert.rejects(task.promise, (error) => error.code === 'CANCELLED');
  assert.equal(signal.aborted, true);
  assert.equal(called, false);
});

test('all fallback sources ending or stalling terminates once', async () => {
  const { MediaService } = harness({
    qq: { search: () => ({ success() {} }) },
  });
  let successes = 0,
    failures = 0;
  const operation = MediaService.bootstrapTrack(
    { id: 'netrack_1', source: 'netease', title: 'T', artist: 'A' },
    () => {
      successes++;
    },
    () => {
      failures++;
    }
  );
  await assert.rejects(operation.promise);
  assert.equal(successes, 0);
  assert.equal(failures, 1);
});

test('provider pagination uses its page size and preserves unknown totals', async () => {
  const { MediaService } = harness({
    qq: { search: () => ({ success: (fn) => fn({ result: [], total: 100 }) }) },
    migu: {
      search: () => ({ success: (fn) => fn({ result: [], total: 1000 }) }),
    },
  });
  const qq = await MediaService.search('qq', { curpage: 2, type: 0 }).promise;
  assert.equal(qq.pageSize, 50);
  assert.equal(qq.hasMore, false);
  const migu = await MediaService.search('migu', { curpage: 1, type: 0 })
    .promise;
  assert.equal(migu.total, null);
});
