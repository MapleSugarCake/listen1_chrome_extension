/**
 * 文件职责：使用虚拟机和 Howler 替身验证播放代次、迟到回调、队列批量更新及核心行为回归。
 *
 * 文件级定义：
 * - test：从 node:test 引入，用于注册 Node 行为测试。
 * - assert：从 node:assert/strict 引入，用于断言测试结果。
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - vm：从 node:vm 引入，用于执行带受控全局对象的测试源码。
 * - js：共享脚本所在目录，供虚拟机测试读取源码。
 * - playerHarness：创建可记录请求和消息的播放器虚拟机，使用轻量 Howler 替身观察播放代次与队列行为。
 */
/**
 * test：从 node:test 引入，用于注册 Node 行为测试；类型为 typeof import("node:test")。
 * @type {typeof import("node:test")}
 */
const test = require('node:test');
/**
 * assert：从 node:assert/strict 引入，用于断言测试结果；类型为 typeof import("node:assert/strict")。
 * @type {typeof import("node:assert/strict")}
 */
const assert = require('node:assert/strict');
/**
 * fs：从 node:fs 引入，用于文件读写与目录操作；类型为 typeof import("node:fs")。
 * @type {typeof import("node:fs")}
 */
const fs = require('node:fs');
/**
 * path：从 node:path 引入，用于路径解析和拼接；类型为 typeof import("node:path")。
 * @type {typeof import("node:path")}
 */
const path = require('node:path');
/**
 * vm：从 node:vm 引入，用于执行带受控全局对象的测试源码；类型为 typeof import("node:vm")。
 * @type {typeof import("node:vm")}
 */
const vm = require('node:vm');
/**
 * js：共享脚本所在目录，供虚拟机测试读取源码；类型为 string。
 * @type {string}
 */
const js = path.resolve(__dirname, '../js');

/**
 * 创建可记录请求和消息的播放器虚拟机，使用轻量 Howler 替身观察播放代次与队列行为。
 * 无参数。
 * @returns {Object} 包含 player、events、requests 的对象。
 */
function playerHarness() {
  const events = [];
  const requests = [];
  const context = vm.createContext({
    window: {},
    navigator: {
      mediaSession: {
        /**
         * 测试替身：接受此处调用但不执行操作。
         * 无参数。
         * @returns {void} 无返回值。
         */
        setActionHandler() {},
        /**
         * 测试替身：接受此处调用但不执行操作。
         * 无参数。
         * @returns {void} 无返回值。
         */
        setPositionState() {},
      },
    },
    /**
     * 测试替身：取得 0，供用例观察调用与状态。
     * 无参数。
     * @returns {number} 0。
     */
    setInterval() {
      return 0;
    },
    /**
     * 测试替身：接受此处调用但不执行操作。
     * 无参数。
     * @returns {void} 无返回值。
     */
    clearInterval() {},
    setTimeout,
    clearTimeout,
    Howler: {
      /**
       * 测试替身：取得 1，供用例观察调用与状态。
       * 无参数。
       * @returns {number} 1。
       */
      volume: () => 1,
      /**
       * 测试替身：接受此处调用但不执行操作。
       * 无参数。
       * @returns {void} 无返回值。
       */
      unload() {},
    },
    Howl:
      /**
       * 测试中使用的 Howl 替身类，生命周期限于当前虚拟机用例。
       */
      class {
        /**
         * 测试替身：更新 this.options，供用例观察调用与状态。
         * @param options 本次操作选项。
         * @returns {Howl} 由 new 创建并初始化的实例。
         */
        constructor(options) {
          this.options = options;
        }
        /**
         * 测试替身：取得 false，供用例观察调用与状态。
         * 无参数。
         * @returns {boolean} false。
         */
        playing() {
          return false;
        }
        /**
         * 测试替身：接受此处调用但不执行操作。
         * 无参数。
         * @returns {void} 无返回值。
         */
        play() {}
        /**
         * 测试替身：接受此处调用但不执行操作。
         * 无参数。
         * @returns {void} 无返回值。
         */
        stop() {}
        /**
         * 测试替身：接受此处调用但不执行操作。
         * 无参数。
         * @returns {void} 无返回值。
         */
        unload() {}
      },
    /**
     * 测试替身：执行 events.push，供用例观察调用与状态。
     * @param mode 前台／后台或播放模式值，按当前接口约定使用；当前函数体未使用，保留调用签名。
     * @param message 待转发的消息或文本。
     * @returns {number} 追加后的数组长度。
     */
    playerSendMessage: (mode, message) => events.push(message),
    MediaService: {
      /**
       * 测试替身：执行 requests.push，供用例观察调用与状态。
       * @param track 统一曲目对象，包含用于路由和查找的 ID。
       * @param success 接收成功业务结果的回调。
       * @param failure 接收失败原因的回调；省略时沿用声明中的默认处理。
       * @returns {Object} 包含 cancel 的对象。
       */
      bootstrapTrack: (track, success, failure) => {
        const req = { track, success, failure, cancelled: false };
        requests.push(req);
        return {
          /**
           * 测试替身：更新 req.cancelled，供用例观察调用与状态。
           * 无参数。
           * @returns {void} 无返回值。
           */
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

test('editing current local metadata preserves paused audio, position, source and identity', () => {
  const { player, events, requests } = playerHarness();
  const track = {
    id: 'lmtrack_C:/Music/a.wav',
    title: 'Old',
    source: 'localmusic',
  };
  player.setNewPlaylist([track, { id: 'netrack_1', title: 'Online' }]);
  player.loadById(track.id);
  const audio = { seek: () => 17, duration: () => 40, playing: () => false };
  player.currentAudio.howl = audio;
  const generation = player._generation;
  events.length = 0;
  player.updateTrackMetadata(track.id, {
    title: 'Edited',
    artist: '',
    album: '',
    img_url: 'file:///C:/profile/cover.png',
    cover_asset_id: '12345678-1234-1234-1234-123456789abc',
    cover_file_name: '实际封面.png',
    source: 'qq',
    id: 'qqtrack_wrong',
    howl: null,
  });
  assert.equal(player.currentAudio.title, 'Edited');
  assert.equal(player.currentAudio.cover_file_name, '实际封面.png');
  assert.equal(player.currentAudio.id, track.id);
  assert.equal(player.currentAudio.source, 'localmusic');
  assert.equal(player.currentHowl, audio);
  assert.equal(player.currentHowl.seek(), 17);
  assert.equal(player.playing, false);
  assert.equal(player._generation, generation);
  assert.equal(requests.length, 0);
  assert.deepEqual(
    events.map((event) => event.type),
    ['BG_PLAYER:PLAYLIST', 'BG_PLAYER:LOAD']
  );
  player.updateTrackMetadata('netrack_1', { title: 'Ignored' });
  assert.equal(player.playlist[1].title, 'Online');
});

test('read-only audio source snapshots expose actual fallback and invalidate after clearing', () => {
  const { player, requests } = playerHarness();
  player.setNewPlaylist([{ id: 'netrack_a', source: 'netease' }]);
  assert.equal(player.getResolvedAudioSource('netrack_a'), null);
  player.loadById('netrack_a');
  player.play();
  requests[0].success({ url: 'https://qq.com/fallback.wav', platform: 'qq' });
  const first = player.getResolvedAudioSource('netrack_a');
  assert.equal(first.platform, 'qq');
  assert.equal(first.url, 'https://qq.com/fallback.wav');
  first.url = 'tampered';
  assert.equal(
    player.getResolvedAudioSource('netrack_a').url,
    'https://qq.com/fallback.wav'
  );
  player.setMediaURI('https://qq.com/changed.wav', 'netrack_a');
  assert.ok(
    player.getResolvedAudioSource('netrack_a').identity > first.identity
  );
  player.clearPlaylist();
  assert.equal(player.getResolvedAudioSource('netrack_a'), null);
});

test('empty queue controls do not throw or resolve a nonexistent song' /**
 * 验证空队列的播放和切歌操作不会抛错或解析不存在的曲目；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
  const { player, requests } = playerHarness();
  assert.doesNotThrow(
    /**
     * 测试替身：执行 player.play，供用例观察调用与状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    () => {
      player.play();
      player.skip('next');
      player.skip('prev');
      player.removeAudio(0);
    }
  );
  assert.equal(requests.length, 0);
  assert.equal(player.index, -1);
});

test('batch insertion emits one queue snapshot and deduplicates IDs' /**
 * 验证批量入队按 ID 去重且仅发送一次队列快照；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
  const { player, events } = playerHarness();
  const list = Array.from(
    { length: 1000 },
    /**
     * 测试替身：取得 包含 id、source 的对象，供用例观察调用与状态。
     * @param _ 数组或类数组输入中的当前值；当前函数体未使用，保留调用签名。
     * @param i 当前条目的零起点索引。
     * @returns {Object} 包含 id、source 的对象。
     */
    (_, i) => ({
      id: `netrack_${i}`,
      source: 'netease',
    })
  );
  player.appendAudioList([...list, list[0]]);
  assert.equal(player.playlist.length, 1000);
  const snapshots = events.filter(
    /**
     * 筛选检查 events 中的条目，event.type 是否严格等于 "BG_PLAYER:PLAYLIST"。
     * @param event 来自 events 的当前条目；使用 type 字段。
     * @returns {boolean} event.type 是否严格等于 "BG_PLAYER:PLAYLIST"。
     */
    (event) => event.type === 'BG_PLAYER:PLAYLIST'
  );
  assert.equal(snapshots.length, 1);
  assert.equal(snapshots[0].data.length, 1000);
});

test('clearing a queue invalidates late media callbacks' /**
 * 验证清空队列后迟到的媒体回调失效；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
  const { player, requests } = playerHarness();
  player.setNewPlaylist([{ id: 'netrack_1', source: 'netease' }]);
  player.play(0);
  player.clearPlaylist();
  assert.doesNotThrow(
    /**
     * 测试替身：执行 requests[0].success，供用例观察调用与状态。
     * 无参数。
     * @returns {*} requests[0].success 的调用结果。
     */
    () => requests[0].success({ url: 'https://example.invalid/song.mp3' })
  );
  assert.equal(player.playlist.length, 0);
  assert.equal(player.index, -1);
});

test('repeated play while resolving shares a single request' /**
 * 验证地址解析期间的重复播放操作复用同一个请求；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
  const { player, requests } = playerHarness();
  player.setNewPlaylist([{ id: 'netrack_1', source: 'netease' }]);
  player.play(0);
  player.play(0);
  assert.equal(requests.length, 1);
});

test('late playback failure cannot skip the newly selected track' /**
 * 验证旧播放失败回调不会跳过新选中的曲目；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
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

test('changing keywords prevents stale responses and clearing cancels results' /**
 * 验证更换关键词阻止旧响应覆盖结果，清空关键词时取消请求；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
  let controller, watcher;
  const pending = [];
  const scope = {
    /**
     * 测试替身：更新 watcher，供用例观察调用与状态。
     * @param key 索引、配置或字段名称；当前函数体未使用，保留调用签名。
     * @param fn 接收处理结果的回调函数。
     * @returns {void} 无返回值。
     */
    $watch: (key, fn) => {
      watcher = fn;
    },
    /**
     * 测试替身：调用 fn 完成通知，供用例观察调用与状态。
     * @param fn 接收处理结果的回调函数。
     * @returns {*} fn 回调的直接返回值。
     */
    $evalAsync: (fn) => fn(),
    /**
     * 测试替身：接受此处调用但不执行操作。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $on() {},
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(js, 'controller/instant_search.js'), 'utf8'),
    {
      angular: {
        /**
         * 测试替身：取得 包含 controller 的对象，供用例观察调用与状态。
         * 无参数。
         * @returns {Object} 包含 controller 的对象。
         */
        module: () => ({
          /**
           * 测试替身：更新 controller，执行 args.at，供用例观察调用与状态。
           * @param name 待查找或注册的名称；当前函数体未使用，保留调用签名。
           * @param args 传递给包装函数的参数；使用 at 字段。
           * @returns {void} 无返回值。
           */
          controller: (name, args) => {
            controller = args.at(-1);
          },
        }),
      },
      sourceList: [{ name: 'netease' }],
      i18next: {
        /**
         * 测试替身：取得 x，供用例观察调用与状态。
         * @param x 需要原样交回调用方的测试输入。
         * @returns {*} x。
         */
        t: (x) => x,
      },
      MediaService: {
        /**
         * 测试替身：执行 pending.push，供用例观察调用与状态。
         * @param source 音乐来源名称；当前函数体未使用，保留调用签名。
         * @param options 本次操作选项。
         * @returns {Object} 当前请求任务 task。
         */
        search: (source, options) => {
          const task = {
            options,
            /**
             * 登记或执行旧式成功入口，更新 this.callback；业务结果通过 fn 传出。
             * @param fn 接收处理结果的回调函数。
             * @returns {*} 当前实例。
             */
            success(fn) {
              this.callback = fn;
              return this;
            },
            /**
             * 测试替身：取得 当前实例，供用例观察调用与状态。
             * 无参数。
             * @returns {*} 当前实例。
             */
            error() {
              return this;
            },
            /**
             * 测试替身：取得 当前实例，供用例观察调用与状态。
             * 无参数。
             * @returns {*} 当前实例。
             */
            onProgress() {
              return this;
            },
            /**
             * 测试替身：接受此处调用但不执行操作。
             * 无参数。
             * @returns {void} 无返回值。
             */
            cancel() {},
          };
          pending.push(task);
          return task;
        },
      },
      document: {
        /**
         * 测试替身：取得 包含 scrollTo 的对象，供用例观察调用与状态。
         * 无参数。
         * @returns {Object} 包含 scrollTo 的对象。
         */
        querySelector: () => ({
          /**
           * 测试替身：接受此处调用但不执行操作。
           * 无参数。
           * @returns {void} 无返回值。
           */
          scrollTo() {},
        }),
      },
    }
  );
  controller(
    scope,
    /**
     * 测试替身：接受此处调用但不执行操作。
     * 无参数。
     * @returns {void} 无返回值。
     */
    () => {},
    {
      /**
       * 测试替身：接受此处调用但不执行操作。
       * 无参数。
       * @returns {void} 无返回值。
       */
      $broadcast() {},
    }
  );
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

test('queue reordering keeps a pending URL tied to its track identity' /**
 * 验证队列重排后在途地址仍绑定原曲目 ID；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
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

test('returning to a previous track creates fresh Howler callbacks' /**
 * 验证重新回到前一曲目时使用新一轮 Howler 回调；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
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

test('expired media failures resolve at most once more and then finish' /**
 * 验证过期媒体失败最多重新解析一次并最终结束；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
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
    events.some(
      /**
       * 筛选检查 events 中的条目，event.type 是否严格等于 "BG_PLAYER:RETRIEVE_URL_FAIL_ALL"。
       * @param event 来自 events 的当前条目；使用 type 字段。
       * @returns {boolean} event.type 是否严格等于 "BG_PLAYER:RETRIEVE_URL_FAIL_ALL"。
       */
      (event) => event.type === 'BG_PLAYER:RETRIEVE_URL_FAIL_ALL'
    )
  );
  player.clearPlaylist();
});

test('removing the resolving track continues to the next and ignores its old response' /**
 * 验证删除正在解析的曲目后继续下一首并忽略被删曲目的响应；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
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
