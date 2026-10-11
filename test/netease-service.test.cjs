const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const axiosLibrary = require('axios');

const read = (file) =>
  fs.readFileSync(path.join(__dirname, '../js', file), 'utf8');
const tick = () => new Promise((resolve) => setImmediate(resolve));

function harness(
  adapter = async () => ({ code: 200, account: null }),
  overrides = {}
) {
  const logs = [];
  const calls = [];
  const axios = axiosLibrary.create({
    adapter: async (config) => {
      calls.push(config);
      const data = await adapter(config);
      return { data, status: 200, statusText: 'OK', headers: {}, config };
    },
  });
  const empty = {
    search: () => ({ success: (fn) => fn({ result: [], total: 0 }) }),
  };
  const context = vm.createContext({
    AbortController,
    URLSearchParams,
    Promise,
    axios,
    clearTimeout,
    setTimeout: (fn, ms) => setTimeout(fn, ms >= 15000 ? 100 : ms),
    console: { warn: (...args) => logs.push(args) },
    getParameterByName: (name, url) =>
      new URL(url, 'https://example.invalid').searchParams.get(name),
    LRUCache: class {
      get() {}
      set() {}
    },
    setPrototypeOfLocalStorage() {},
    localStorage: { getObject: () => false },
    getLocalStorageValue: () => [],
    ...Object.fromEntries(
      [
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
  vm.runInContext(read('request.js'), context);
  vm.runInContext(read('provider/netease.js'), context);
  vm.runInContext(
    'netease.weapi = (data) => data; netease.ne_ensure_cookie = (fn) => fn();',
    context
  );
  vm.runInContext(read('loweb.js'), context);
  return {
    ...vm.runInContext(
      '({ MediaService, RequestTask, provider: netease })',
      context
    ),
    logs,
    calls,
  };
}

test('single-source songs and playlists keep first identities and raw pagination', async () => {
  for (const type of [0, 1]) {
    const { MediaService, provider, logs } = harness();
    const original = Array.from({ length: 16 }, (_, index) => ({
      id: 'ne_' + index,
      source: 'netease',
      title: 'first-' + index,
    }));
    const result = [
      ...original,
      ...original.slice(0, 4).map((item) => ({ ...item, title: 'later' })),
    ];
    provider.search = () => ({ success: (fn) => fn({ result, total: null }) });
    const data = await MediaService.search('netease', { type, curpage: 1 })
      .promise;
    assert.equal(data.result.length, 16);
    assert.equal(data.result[0], original[0]);
    assert.deepEqual(
      Array.from(data.result, (item) => item.title),
      original.map((item) => item.title)
    );
    assert.equal(data.hasMore, true);
    assert.equal(data.pageSize, 20);
    assert.equal(data.total, null);
    assert.equal(result.length, 20);
    assert.equal(JSON.parse(logs[0][1]).duplicates, 4);
    provider.search = () => ({
      success: (fn) => fn({ result, total: 40, pageSize: 20, hasMore: false }),
    });
    const explicit = await MediaService.search('netease', { type, curpage: 2 })
      .promise;
    assert.equal(explicit.total, 40);
    assert.equal(explicit.hasMore, false);
    provider.search = () => ({
      success: (fn) => fn({ result: [], total: null }),
    });
    assert.equal(
      (await MediaService.search('netease', { type, curpage: 3 }).promise)
        .hasMore,
      false
    );
  }
});

test('deduplication preserves other sources with the same ID and aggregate progress', async () => {
  const { MediaService, provider } = harness();
  provider.search = () => ({
    success: (fn) =>
      fn({
        result: [
          { id: 'same', source: 'netease' },
          { id: 'same', source: 'qq' },
          { id: 'same', source: 'netease' },
        ],
        total: 3,
      }),
  });
  const updates = [];
  const task = MediaService.search('allmusic', {
    type: 0,
    curpage: 1,
  }).onProgress((data) => updates.push(data));
  const data = await task.promise;
  assert.deepEqual(
    Array.from(data.result, (item) => item.source),
    ['netease', 'qq']
  );
  for (const update of updates)
    assert.equal(
      new Set(update.result.map((item) => item.source + ':' + item.id)).size,
      update.result.length
    );
});

test('Netease account distinguishes guest, expired session and malformed success', async () => {
  let body = { code: 200, account: null, profile: null };
  const { MediaService } = harness(async () => body);
  assert.equal((await MediaService.getUser('netease').promise).status, 'fail');
  body = {
    code: 200,
    account: { id: 42, userName: 'fixture' },
    profile: { nickname: 'Fixture', avatarUrl: '' },
  };
  assert.equal(
    (await MediaService.getUser('netease').promise).data.user_id,
    42
  );
  for (const [code, expected] of [
    [301, 'AUTH_REQUIRED'],
    [403, 'ACCESS_DENIED'],
    [429, 'RATE_LIMIT'],
    [-462, 'SERVICE_ERROR'],
  ]) {
    body = { code };
    await assert.rejects(
      MediaService.getUser('netease').promise,
      (error) => error.code === expected && error.businessCode === code
    );
  }
  for (const malformed of [
    {},
    { code: 200 },
    { code: 200, account: { id: 42, userName: 'fixture' }, profile: null },
  ]) {
    body = malformed;
    await assert.rejects(
      MediaService.getUser('netease').promise,
      (error) => error.code === 'INVALID_RESPONSE'
    );
  }
});

test('created, favorite and recommended playlists validate failures and accept empty arrays', async () => {
  let body = { code: 200, playlist: [] };
  const { MediaService } = harness(async () => body);
  const options = { user_id: 42 };
  assert.equal(
    (await MediaService.getUserCreatedPlaylist('netease', options).promise).data
      .playlists.length,
    0
  );
  body = {
    code: 200,
    playlist: [
      { id: 1, name: 'Created', subscribed: false },
      { id: 2, name: 'Favorite', subscribed: true },
    ],
  };
  assert.equal(
    (await MediaService.getUserCreatedPlaylist('netease', options).promise).data
      .playlists[0].id,
    'neplaylist_1'
  );
  assert.equal(
    (await MediaService.getUserFavoritePlaylist('netease', options).promise)
      .data.playlists[0].id,
    'neplaylist_2'
  );
  body = { code: 200, result: [] };
  assert.equal(
    (await MediaService.getRecommendPlaylist('netease').promise).data.playlists
      .length,
    0
  );
  for (const method of [
    'getUserCreatedPlaylist',
    'getUserFavoritePlaylist',
    'getRecommendPlaylist',
  ]) {
    body = { code: 301 };
    await assert.rejects(
      MediaService[method]('netease', options).promise,
      (error) => error.code === 'AUTH_REQUIRED'
    );
    body = { code: 200 };
    await assert.rejects(
      MediaService[method]('netease', options).promise,
      (error) => error.code === 'INVALID_RESPONSE'
    );
  }
});

test('Netease cancellation and timeout abort actual Axios adapters', async () => {
  for (const method of [
    'getUser',
    'getUserCreatedPlaylist',
    'getUserFavoritePlaylist',
    'getRecommendPlaylist',
  ]) {
    let aborted = false;
    const { MediaService, calls } = harness(
      (config) =>
        new Promise((resolve, reject) => {
          config.signal.addEventListener(
            'abort',
            () => {
              aborted = true;
              reject(new axiosLibrary.CanceledError());
            },
            { once: true }
          );
        })
    );
    const task = MediaService[method]('netease', { user_id: 42 });
    await tick();
    assert.equal(calls.length, 1);
    task.cancel();
    await assert.rejects(task.promise, (error) => error.code === 'CANCELLED');
    assert.equal(aborted, true);
  }
  let aborted = false;
  const { MediaService } = harness(
    (config) =>
      new Promise((resolve, reject) => {
        config.signal.addEventListener('abort', () => {
          aborted = true;
          reject(new axiosLibrary.CanceledError());
        });
      })
  );
  await assert.rejects(
    MediaService.getUser('netease').promise,
    (error) => error.code === 'TIMEOUT'
  );
  assert.equal(aborted, true);
});

test('recommendation tasks keep other legacy providers compatible and unsupported explicit', async () => {
  let signal;
  const { MediaService } = harness(undefined, {
    qq: {
      get_recommend_playlist: (options) => {
        signal = options.signal;
        return {
          success: (fn) => fn({ status: 'success', data: { playlists: [] } }),
        };
      },
    },
  });
  const task = MediaService.getRecommendPlaylist('qq');
  assert.equal(typeof task.error, 'function');
  assert.equal(typeof task.cancel, 'function');
  assert.equal((await task.promise).status, 'success');
  assert.equal(signal.aborted, true);
  await assert.rejects(
    MediaService.getRecommendPlaylist('migu').promise,
    (error) => error.code === 'UNSUPPORTED'
  );
});

test('HTTP/network errors retain classification and diagnostics omit arbitrary payloads', async () => {
  for (const [status, expected] of [
    [401, 'AUTH_REQUIRED'],
    [403, 'ACCESS_DENIED'],
    [429, 'RATE_LIMIT'],
    [503, 'SERVICE_ERROR'],
    [undefined, 'NETWORK'],
  ]) {
    const { MediaService, logs } = harness(async () => {
      throw Object.assign(new Error('synthetic private message'), {
        isAxiosError: true,
        response: status ? { status } : undefined,
        config: { headers: { Cookie: 'synthetic-private-value' } },
      });
    });
    await assert.rejects(
      MediaService.getUser('netease').promise,
      (error) => error.code === expected && error.status === status
    );
    await assert.rejects(
      MediaService.search('netease', {
        keywords: 'fixture',
        type: 0,
        curpage: 1,
      }).promise,
      (error) => error.code === expected && error.status === status
    );
    assert.ok(logs.length > 0);
    assert.ok(!JSON.stringify(logs).includes('private'));
  }
  const { RequestTask, logs } = harness();
  RequestTask.diagnose({
    source: 'netease',
    endpoint: 'user',
    stage: 'user',
    code: 'NETWORK',
    Cookie: 'synthetic-private-value',
    businessCode: 'synthetic-private-value',
  });
  assert.equal(JSON.stringify(logs).includes('private'), false);
});

function controllerHarness() {
  const definitions = {};
  const scopes = [];
  const requests = [];
  const root = {
    $broadcast: (event, data) =>
      scopes.forEach((scope) => scope.emit(event, data)),
  };
  const context = {
    Map,
    i18next: { t: (key) => key },
    isElectron: () => false,
    window: { open() {} },
    angular: {
      module: () => ({
        controller: (name, args) => {
          definitions[name] = args.at(-1);
        },
      }),
    },
    MediaService: {
      getLoginProviders: () => [{ name: 'netease' }],
      logout() {},
      getLoginUrl: () => '',
    },
  };
  for (const method of [
    'getUser',
    'getUserCreatedPlaylist',
    'getUserFavoritePlaylist',
    'getRecommendPlaylist',
  ])
    context.MediaService[method] = (source, options) => {
      const task = {
        method,
        source,
        options,
        canceled: false,
        success(fn) {
          this.done = fn;
          return this;
        },
        error(fn) {
          this.fail = fn;
          return this;
        },
        cancel() {
          this.canceled = true;
        },
      };
      requests.push(task);
      return task;
    };
  for (const file of ['auth', 'platform'])
    vm.runInNewContext(read('controller/' + file + '.js'), context);
  const scope = (name) => {
    const listeners = new Map();
    const value = {
      $evalAsync: (fn) => fn(),
      $on: (event, fn) => listeners.set(event, fn),
      emit: (event, data) => listeners.get(event)?.({}, data),
    };
    scopes.push(value);
    definitions[name](value, root);
    return value;
  };
  return {
    auth: scope('AuthController'),
    platform: scope('PlatformController'),
    requests,
  };
}

test('deduplicated searches isolate quick keyword/source switches and keep page-local identities', async () => {
  const requests = [];
  const controlled = (source) => ({
    search: (url, options) => ({
      success: (done, fail) =>
        requests.push({ source, url, signal: options.signal, done, fail }),
    }),
  });
  const { MediaService, provider } = harness(undefined, {
    qq: controlled('qq'),
  });
  provider.search = controlled('netease').search;
  let createController;
  let onKeyword;
  let onDestroy;
  const scope = {
    $watch: (key, callback) => {
      onKeyword = callback;
    },
    $on: (event, callback) => {
      onDestroy = callback;
    },
    $evalAsync: (callback) => callback(),
  };
  vm.runInNewContext(read('controller/instant_search.js'), {
    MediaService,
    sourceList: [{ name: 'netease' }, { name: 'qq' }],
    i18next: { t: (key) => key },
    document: { querySelector: () => null },
    angular: {
      module: () => ({
        controller: (name, args) => {
          createController = args.at(-1);
        },
      }),
    },
  });
  createController(scope, null, { $broadcast() {} });
  scope.keywords = 'old';
  onKeyword();
  scope.keywords = 'new';
  onKeyword();
  scope.changeSourceTab('qq');
  assert.ok(requests[0].signal.aborted && requests[1].signal.aborted);
  requests[2].done({
    result: [
      { source: 'qq', id: 'same' },
      { source: 'qq', id: 'same' },
    ],
    total: 2,
  });
  requests[0].done({ result: [{ source: 'netease', id: 'stale' }], total: 1 });
  requests[1].fail({ code: 'NETWORK' });
  await tick();
  assert.equal(scope.tab, 'qq');
  assert.equal(scope.result.length, 1);
  assert.equal(scope.result[0].id, 'same');
  assert.equal(scope.searchError, null);
  const unique = Array.from({ length: 16 }, (_, id) => ({
    source: 'netease',
    id: String(id),
  }));
  const result = [...unique, ...unique.slice(0, 4)];
  scope.changeSourceTab('netease');
  requests[3].done({ result, total: 40, pageSize: 20 });
  await tick();
  assert.equal(scope.result.length, 16);
  assert.equal(scope.hasMore, true);
  scope.nextPage();
  requests[4].done({ result, total: 40, pageSize: 20 });
  await tick();
  assert.equal(scope.curpage, 2);
  assert.equal(scope.result.length, 16); // 第二页重复出现第一页 ID 仍保留，只在本页去重。
  assert.equal(scope.hasMore, false);
  scope.changeSourceTab('qq');
  assert.equal(scope.curpage, 1);
  onDestroy();
  assert.equal(requests[5].signal.aborted, true);
  requests[5].done({ result, total: 40 });
  await tick();
  assert.equal(scope.result.length, 0);
});

test('account refresh preserves known user on error, rejects stale results and clears playlists on logout', () => {
  const { auth, platform, requests } = controllerHarness();
  const user = { platform: 'netease', is_login: true, user_id: 42 };
  auth.refreshAuthStatus();
  requests[0].done({ status: 'success', data: user });
  platform.initPlatformController(user);
  requests[1].done({
    status: 'success',
    data: { playlists: [{ id: 'neplaylist_1' }] },
  });
  auth.refreshAuthStatus();
  requests[2].fail({ code: 'NETWORK' });
  assert.equal(auth.musicAuth.netease, user);
  assert.equal(auth.authStatus.netease.error, 'NETWORK');
  assert.equal(auth.authStatus.netease.loading, false);
  auth.refreshAuthStatus();
  const stale = requests[3];
  auth.logout('netease');
  assert.equal(stale.canceled, true);
  stale.done({ status: 'success', data: user });
  assert.equal(auth.is_login('netease'), false);
  assert.equal(platform.myPlatformPlaylists.length, 0);
  auth.refreshAuthStatus();
  const late = requests.at(-1);
  auth.emit('$destroy');
  late.done({ status: 'success', data: user });
  assert.equal(auth.is_login('netease'), false);
});

test('playlist retries, account/category switches and destruction reject delayed successes', () => {
  const { auth, platform, requests } = controllerHarness();
  platform.initPlatformController({ platform: 'netease', user_id: 42 });
  const stale = requests[0];
  platform.changeTab('my_favorite_playlist');
  assert.equal(stale.canceled, true);
  stale.done({ status: 'success', data: { playlists: [{ id: 'stale' }] } });
  assert.equal(platform.myPlatformPlaylists.length, 0);
  requests[1].fail({ code: 'TIMEOUT' });
  assert.equal(platform.platformLoading, false);
  assert.equal(platform.platformError, 'TIMEOUT');
  platform.loadPlatformPlaylists();
  const oldAccount = requests[2];
  auth.setMusicAuth('netease', {
    platform: 'netease',
    user_id: 43,
    is_login: true,
  });
  assert.equal(oldAccount.canceled, true);
  oldAccount.done({
    status: 'success',
    data: { playlists: [{ id: 'old-account' }] },
  });
  assert.equal(platform.myPlatformPlaylists.length, 0);
  const last = requests.at(-1);
  platform.emit('$destroy');
  last.done({ status: 'success', data: { playlists: [{ id: 'destroyed' }] } });
  assert.equal(platform.myPlatformPlaylists.length, 0);
});
