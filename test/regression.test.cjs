const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const js = path.resolve(__dirname, '../js');

function playerHarness() {
  const events = [];
  const requests = [];
  const context = vm.createContext({
    window: {},
    navigator: {
      mediaSession: { setActionHandler() {}, setPositionState() {} },
    },
    setInterval() {
      return 0;
    },
    clearInterval() {},
    setTimeout,
    clearTimeout,
    Howler: { volume: () => 1, unload() {} },
    Howl: class {
      constructor(options) {
        this.options = options;
      }
      playing() {
        return false;
      }
      play() {}
      stop() {}
      unload() {}
    },
    playerSendMessage: (mode, message) => events.push(message),
    MediaService: {
      bootstrapTrack: (track, success, failure) => {
        const req = { track, success, failure, cancelled: false };
        requests.push(req);
        return {
          cancel() {
            req.cancelled = true;
          },
        };
      },
    },
  });
  vm.runInContext(
    fs.readFileSync(path.join(js, 'player_thread.js'), 'utf8'),
    context
  );
  return { player: context.window.threadPlayer, events, requests };
}

test('empty queue controls do not throw or resolve a nonexistent song', () => {
  const { player, requests } = playerHarness();
  assert.doesNotThrow(() => {
    player.play();
    player.skip('next');
    player.skip('prev');
    player.removeAudio(0);
  });
  assert.equal(requests.length, 0);
  assert.equal(player.index, -1);
});

test('batch insertion emits one queue snapshot and deduplicates IDs', () => {
  const { player, events } = playerHarness();
  const list = Array.from({ length: 1000 }, (_, i) => ({
    id: `netrack_${i}`,
    source: 'netease',
  }));
  player.appendAudioList([...list, list[0]]);
  assert.equal(player.playlist.length, 1000);
  const snapshots = events.filter(
    (event) => event.type === 'BG_PLAYER:PLAYLIST'
  );
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].data.length, 1000);
});

test('clearing a queue invalidates late media callbacks', () => {
  const { player, requests } = playerHarness();
  player.setNewPlaylist([{ id: 'netrack_1', source: 'netease' }]);
  player.play(0);
  player.clearPlaylist();
  assert.doesNotThrow(() =>
    requests[0].success({ url: 'https://example.invalid/song.mp3' })
  );
  assert.equal(player.playlist.length, 0);
  assert.equal(player.index, -1);
});

test('repeated play while resolving shares a single request', () => {
  const { player, requests } = playerHarness();
  player.setNewPlaylist([{ id: 'netrack_1', source: 'netease' }]);
  player.play(0);
  player.play(0);
  assert.equal(requests.length, 1);
});

test('late playback failure cannot skip the newly selected track', () => {
  const { player, requests } = playerHarness();
  player.setNewPlaylist([
    { id: 'netrack_1', source: 'netease' },
    { id: 'netrack_2', source: 'netease' },
  ]);
  player.play(0);
  player.play(1);
  requests[0].failure({ code: 'NETWORK' });
  assert.equal(player.currentAudio.id, 'netrack_2');
  assert.equal(player.playlist[1].disabled, undefined);
});

test('changing keywords prevents stale responses and clearing cancels results', () => {
  let controller, watcher;
  const pending = [];
  const scope = {
    $watch: (key, fn) => {
      watcher = fn;
    },
    $evalAsync: (fn) => fn(),
    $on() {},
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(js, 'controller/instant_search.js'), 'utf8'),
    {
      angular: {
        module: () => ({
          controller: (name, args) => {
            controller = args.at(-1);
          },
        }),
      },
      sourceList: [{ name: 'netease' }],
      i18next: { t: (x) => x },
      MediaService: {
        search: (source, options) => {
          const task = {
            options,
            success(fn) {
              this.callback = fn;
              return this;
            },
            error() {
              return this;
            },
            onProgress() {
              return this;
            },
            cancel() {},
          };
          pending.push(task);
          return task;
        },
      },
      document: { querySelector: () => ({ scrollTo() {} }) },
    }
  );
  controller(scope, () => {}, { $broadcast() {} });
  scope.keywords = 'first';
  watcher('first');
  scope.keywords = 'second';
  watcher('second');
  pending[1].callback({
    result: [{ title: 'second', source: 'netease' }],
    total: 1,
    pageSize: 20,
  });
  pending[0].callback({
    result: [{ title: 'first', source: 'netease' }],
    total: 1,
    pageSize: 20,
  });
  assert.equal(scope.result[0].title, 'second');
  scope.keywords = '';
  watcher('');
  pending[1].callback({
    result: [{ title: 'second', source: 'netease' }],
    total: 1,
  });
  assert.equal(scope.result.length, 0);
});

module.exports = { playerHarness };

test('queue reordering keeps a pending URL tied to its track identity', () => {
  const { player, requests } = playerHarness();
  const a = { id: 'netrack_a', source: 'netease' },
    b = { id: 'netrack_b', source: 'netease' };
  player.setNewPlaylist([a, b]);
  player.playById(a.id);
  player.insertAudioByDirection(a, b, 'bottom');
  requests[0].success({
    url: 'https://example.invalid/a.mp3',
    platform: 'netease',
  });
  assert.equal(player.currentAudio.id, a.id);
  assert.equal(player.index, 1);
  assert.equal(
    player.currentHowl.options.src[0],
    'https://example.invalid/a.mp3'
  );
  player.clearPlaylist();
});

test('returning to a previous track creates fresh Howler callbacks', () => {
  const { player, requests, events } = playerHarness();
  player.setNewPlaylist([
    { id: 'a', source: 'netease' },
    { id: 'b', source: 'netease' },
  ]);
  player.play(0);
  requests[0].success({ url: 'https://example.invalid/a.mp3' });
  const old = player.currentHowl;
  player.play(1);
  requests[1].success({ url: 'https://example.invalid/b.mp3' });
  const before = events.length;
  old.options.onend();
  old.options.onloaderror(1, 'late');
  assert.equal(events.length, before);
  player.play(0);
  assert.equal(requests.length, 2);
  assert.notEqual(player.currentHowl, old);
  player.clearPlaylist();
});

test('expired media failures resolve at most once more and then finish', () => {
  const { player, requests, events } = playerHarness();
  player.setNewPlaylist([{ id: 'a', source: 'netease' }]);
  player.play();
  requests[0].success({ url: 'https://example.invalid/expired.mp3' });
  player.currentHowl.options.onloaderror(1, 'expired');
  assert.equal(requests.length, 2);
  requests[1].success({ url: 'https://example.invalid/expired2.mp3' });
  player.currentHowl.options.onloaderror(1, 'expired');
  assert.equal(requests.length, 2);
  assert.ok(
    events.some((event) => event.type === 'BG_PLAYER:RETRIEVE_URL_FAIL_ALL')
  );
  player.clearPlaylist();
});

test('removing the resolving track continues to the next and ignores its old response', () => {
  const { player, requests } = playerHarness();
  player.setNewPlaylist([
    { id: 'a', source: 'netease' },
    { id: 'b', source: 'netease' },
  ]);
  player.play();
  player.removeAudio(0);
  assert.equal(player.currentAudio.id, 'b');
  assert.equal(requests.length, 2);
  requests[0].success({ url: 'https://example.invalid/late.mp3' });
  assert.equal(player.currentAudio.id, 'b');
  player.clearPlaylist();
});
