const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (name) =>
  fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');

test('restoring a mixed legacy queue keeps valid tracks and ignores malformed entries', () => {
  let restored;
  const player = {
    playlist: [],
    setNewPlaylist: (value) => {
      restored = value;
    },
    sendPlaylistEvent() {},
    sendPlayingEvent() {},
    sendLoadEvent() {},
  };
  const context = {
    window: {},
    isElectron: () => true,
    getPlayer: () => player,
    getPlayerAsync: (_, fn) => fn(player),
    addPlayerListener() {},
    localStorage: {
      getObject: (key) =>
        key === 'current-playing'
          ? [null, 3, {}, { id: 'netrack_1', disabled: true }]
          : null,
    },
  };
  vm.runInNewContext(read('l1_player.js'), context);
  context.window.l1Player.connectPlayer();
  assert.equal(restored.length, 1);
  assert.equal(restored[0].id, 'netrack_1');
  assert.equal(restored[0].disabled, false);
});

test('playlist navigation ignores delayed results after another selection or closing', () => {
  let controller;
  const pending = [];
  const messages = [];
  const scope = { $on() {}, $evalAsync: (fn) => fn?.() };
  vm.runInNewContext(read('controller/navigation.js'), {
    angular: {
      module: () => ({
        controller: (_, list) => {
          controller = list.at(-1);
        },
      }),
    },
    URL,
    window: { location: 'https://example.invalid/' },
    document: { getElementsByClassName: () => [{ scrollTop: 0 }] },
    localStorage: { getObject: () => null },
    lastfm: {},
    notyf: { info: (message) => messages.push(message) },
    i18next: { t: (key) => key },
    hotkeys() {},
    MediaService: {
      getPlaylist: () => {
        const task = {
          success(fn) {
            this.done = fn;
            return this;
          },
          error(fn) {
            this.fail = fn;
            return this;
          },
          cancel() {},
        };
        pending.push(task);
        return task;
      },
      queryPlaylist: () => ({ success: (fn) => fn({ result: false }) }),
    },
  });
  controller(scope, (fn) => fn(), {});
  scope.showPlaylist('neplaylist_1');
  scope.showPlaylist('neplaylist_2');
  const data = (id) => ({
    info: { id, title: id },
    tracks: [{ id: `track-${id}` }],
  });
  pending[1].done(data('neplaylist_2'));
  pending[0].done(data('neplaylist_1'));
  assert.equal(scope.list_id, 'neplaylist_2');
  scope.showPlaylist('neplaylist_3');
  pending[2].fail({ code: 'NETWORK' });
  assert.equal(messages.at(-1), '_ERROR_NETWORK');
  scope.closeWindow();
  pending[2].done(data('neplaylist_3'));
  assert.equal(scope.songs.length, 0);
  assert.equal(scope.is_window_hidden, 1);
});

test('provider business failures are not reported as successful empty searches', async () => {
  const context = vm.createContext({
    URLSearchParams,
    getParameterByName: (name, url) =>
      new URL(url, 'https://example.invalid').searchParams.get(name),
    RequestTask: {
      http: () => ({ post: async () => ({ data: { code: 301 } }) }),
    },
  });
  vm.runInContext(read('provider/netease.js'), context);
  const provider = vm.runInContext('netease', context);
  provider.ne_ensure_cookie = (fn) => fn();
  await new Promise((resolve, reject) =>
    provider.search('/search?keywords=test&curpage=1&type=0').success(
      () => reject(new Error('Unexpected success')),
      (error) => {
        assert.equal(error.code, 'AUTH_REQUIRED');
        assert.equal(error.businessCode, 301);
        resolve();
      }
    )
  );
});

test('Kuwo and Migu keep punctuation inside the keyword query parameter', async () => {
  const keyword = 'A&B #中文+100%';
  for (const name of ['kuwo', 'migu']) {
    let captured;
    const context = vm.createContext({
      getParameterByName: (key, url) =>
        new URL(url, 'https://example.invalid').searchParams.get(key),
      RequestTask: {
        http: () => ({
          get: async (url) => {
            captured = url;
            return { data: [] };
          },
        }),
      },
    });
    vm.runInContext(read(`provider/${name}.js`), context);
    const provider = vm.runInContext(name, context);
    if (name === 'kuwo')
      provider.kw_cookie_get = (url, fn) => {
        captured = url;
        fn({ data: { abslist: [], HIT: 0 } });
      };
    await new Promise((resolve, reject) =>
      provider
        .search(
          `/search?keywords=${encodeURIComponent(keyword)}&curpage=1&type=0`
        )
        .success(resolve, reject)
    );
    assert.equal(
      new URL(captured).searchParams.get(name === 'kuwo' ? 'all' : 'text'),
      keyword
    );
  }
});
