/**
 * 文件职责：验证本地存储、备份解析和平台数据边界，保证兼容旧数据并容忍缺失字段。
 *
 * 文件级定义：
 * - test：从 node:test 引入，用于注册 Node 行为测试。
 * - assert：从 node:assert/strict 引入，用于断言测试结果。
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - vm：从 node:vm 引入，用于执行带受控全局对象的测试源码。
 * - read：从共享脚本目录读取待测源码文本。
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
 * 从共享脚本目录读取待测源码文本。
 * @param name 待查找或注册的名称。
 * @returns {*} fs.readFileSync 的调用结果。
 */
const read = (name) =>
  fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');

test('restoring a mixed legacy queue keeps valid tracks and ignores malformed entries' /**
 * 验证混合旧队列恢复时保留有效曲目并跳过损坏记录；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
  let restored;
  const player = {
    playlist: [],
    /**
     * 测试替身：更新 restored，供用例观察调用与状态。
     * @param value 待检查或转换的输入值。
     * @returns {void} 无返回值。
     */
    setNewPlaylist: (value) => {
      restored = value;
    },
    /**
     * 测试替身：接受此处调用但不执行操作。
     * 无参数。
     * @returns {void} 无返回值。
     */
    sendPlaylistEvent() {},
    /**
     * 测试替身：接受此处调用但不执行操作。
     * 无参数。
     * @returns {void} 无返回值。
     */
    sendPlayingEvent() {},
    /**
     * 测试替身：接受此处调用但不执行操作。
     * 无参数。
     * @returns {void} 无返回值。
     */
    sendLoadEvent() {},
  };
  const context = {
    window: {},
    /**
     * 测试替身：取得 true，供用例观察调用与状态。
     * 无参数。
     * @returns {boolean} true。
     */
    isElectron: () => true,
    /**
     * 测试替身：取得 player，供用例观察调用与状态。
     * 无参数。
     * @returns {*} player。
     */
    getPlayer: () => player,
    /**
     * 测试替身：调用 fn，依次传入 player，供用例观察调用与状态。
     * @param _ 保留测试替身的调用签名，当前实现未使用；当前函数体未使用，保留调用签名。
     * @param fn 接收处理结果的回调函数。
     * @returns {*} fn 回调的直接返回值。
     */
    getPlayerAsync: (_, fn) => fn(player),
    /**
     * 测试替身：接受此处调用但不执行操作。
     * 无参数。
     * @returns {void} 无返回值。
     */
    addPlayerListener() {},
    localStorage: {
      /**
       * 测试替身：取得 按 key 是否严格等于 "current-playing" 选择的 按声明顺序组成的数组 或 null，供用例观察调用与状态。
       * @param key 索引、配置或字段名称。
       * @returns {*} 按 key 是否严格等于 "current-playing" 选择的 按声明顺序组成的数组 或 null。
       */
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

test('playlist navigation ignores delayed results after another selection or closing' /**
 * 验证切换歌单或关闭详情后丢弃迟到的旧请求结果；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
  let controller;
  const pending = [];
  const messages = [];
  const handlers = new Map();
  const browser = { scrollTop: 0 };
  const lyricSearch = {
    active: false,
    origin: null,
    leave() {
      this.active = false;
    },
  };
  const scope = {
    /**
     * 测试替身：接受此处调用但不执行操作。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $on(name, callback) {
      handlers.set(name, callback);
    },
    $watchGroup() {},
    /**
     * 测试替身：调用 fn 完成通知，供用例观察调用与状态。
     * @param fn 接收处理结果的回调函数。
     * @returns {*} fn 回调的直接返回值。
     */
    $evalAsync: (fn) => fn?.(),
  };
  vm.runInNewContext(read('controller/navigation.js'), {
    angular: {
      /**
       * 测试替身：取得 包含 controller 的对象，供用例观察调用与状态。
       * 无参数。
       * @returns {Object} 包含 controller 的对象。
       */
      module: () => ({
        /**
         * 测试替身：更新 controller，执行 list.at，供用例观察调用与状态。
         * @param _ 保留测试替身的调用签名，当前实现未使用；当前函数体未使用，保留调用签名。
         * @param list 待应用的曲目数组；使用 at 字段。
         * @returns {void} 无返回值。
         */
        controller: (_, list) => {
          controller = list.at(-1);
        },
      }),
    },
    URL,
    window: { location: 'https://example.invalid/' },
    document: {
      /**
       * 测试替身：取得 按声明顺序组成的数组，供用例观察调用与状态。
       * 无参数。
       * @returns {Array} 按声明顺序组成的数组。
       */
      getElementsByClassName: () => [{ scrollTop: 0 }],
      querySelector: () => browser,
    },
    localStorage: {
      /**
       * 测试替身：取得 null，供用例观察调用与状态。
       * 无参数。
       * @returns {null} null。
       */
      getObject: () => null,
    },
    lastfm: {},
    notyf: {
      /**
       * 测试替身：执行 messages.push，供用例观察调用与状态。
       * @param message 待转发的消息或文本。
       * @returns {number} 追加后的数组长度。
       */
      info: (message) => messages.push(message),
    },
    i18next: {
      /**
       * 测试替身：取得 key，供用例观察调用与状态。
       * @param key 索引、配置或字段名称。
       * @returns {*} key。
       */
      t: (key) => key,
    },
    /**
     * 测试替身：接受此处调用但不执行操作。
     * 无参数。
     * @returns {void} 无返回值。
     */
    hotkeys() {},
    MediaService: {
      /**
       * 测试替身：执行 pending.push，供用例观察调用与状态。
       * 无参数。
       * @returns {Object} 当前请求任务 task。
       */
      getPlaylist: () => {
        const task = {
          /**
           * 登记或执行旧式成功入口，更新 this.done；业务结果通过 fn 传出。
           * @param fn 接收处理结果的回调函数。
           * @returns {*} 当前实例。
           */
          success(fn) {
            this.done = fn;
            return this;
          },
          /**
           * 测试替身：更新 this.fail，供用例观察调用与状态。
           * @param fn 接收处理结果的回调函数。
           * @returns {*} 当前实例。
           */
          error(fn) {
            this.fail = fn;
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
      /**
       * 测试替身：取得 包含 success 的对象，供用例观察调用与状态。
       * 无参数。
       * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
       */
      queryPlaylist: () => ({
        /**
         * 登记或执行旧式成功入口，调用 fn，依次传入 包含 result 的对象；业务结果通过 fn 传出。
         * @param fn 接收处理结果的回调函数。
         * @returns {*} fn 回调的直接返回值。
         */
        success: (fn) => fn({ result: false }),
      }),
    },
  });
  controller(
    scope,
    /**
     * 测试替身：调用 fn 完成通知，供用例观察调用与状态。
     * @param fn 接收处理结果的回调函数。
     * @returns {*} fn 回调的直接返回值。
     */
    (fn) => fn(),
    { $broadcast: (name) => handlers.get(name)?.() },
    lyricSearch
  );
  scope.showPlaylist('neplaylist_1');
  scope.showPlaylist('neplaylist_2');
  /**
   * 测试替身：取得 包含 info、tracks 的对象，供用例观察调用与状态。
   * @param id 目标条目的唯一标识。
   * @returns {Object} 包含 info、tracks 的对象。
   */
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
  scope.showPlaylist('neplaylist_4');
  pending[3].done(data('neplaylist_4'));
  browser.scrollTop = 140;
  const previousUrl = scope.getCurrentUrl();
  lyricSearch.active = true;
  handlers.get('lyric-search:open')();
  assert.equal(scope.current_tag, 7);
  assert.equal(scope.is_window_hidden, 1);
  assert.equal(browser.scrollTop, 0);
  scope.popWindow();
  assert.equal(lyricSearch.active, false);
  assert.equal(scope.is_window_hidden, 0);
  assert.equal(scope.getCurrentUrl(), previousUrl);
  assert.equal(scope.list_id, 'neplaylist_4');
  assert.equal(scope.songs[0].id, 'track-neplaylist_4');
  assert.equal(browser.scrollTop, 140);
});

test('provider business failures are not reported as successful empty searches' /**
 * 验证来源业务错误进入失败通道，避免被当作成功的空搜索；断言失败由测试运行器记录。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */, async () => {
  const context = vm.createContext({
    URLSearchParams,
    /**
     * 测试替身：执行 new URL().searchParams.get，供用例观察调用与状态。
     * @param name 待查找或注册的名称。
     * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
     * @returns {*} new URL().searchParams.get 的调用结果。
     */
    getParameterByName: (name, url) =>
      new URL(url, 'https://example.invalid').searchParams.get(name),
    RequestTask: {
      /**
       * 测试替身：取得 包含 post 的对象，供用例观察调用与状态。
       * 无参数。
       * @returns {Object} 包含 post 的对象。
       */
      http: () => ({
        /**
         * 测试替身：取得 包含 data 的对象，供用例观察调用与状态。
         * 无参数。
         * @returns {Promise<Object>} 异步完成后得到 包含 data 的对象。
         */
        post: async () => ({ data: { code: 301 } }),
      }),
    },
  });
  vm.runInContext(read('provider/netease.js'), context);
  const provider = vm.runInContext('netease', context);
  /**
   * 测试替身：调用 fn 完成通知，供用例观察调用与状态。
   * @param fn 接收处理结果的回调函数。
   * @returns {*} fn 回调的直接返回值。
   */
  provider.ne_ensure_cookie = (fn) => fn();
  await new Promise(
    /**
     * 启动当前异步操作，执行 provider.search().success，由 resolve／reject 决定 Promise 的结果。
     * @param resolve 用于兑现当前 Promise 的函数。
     * @param reject 用于拒绝当前 Promise 的函数。
     * @returns {*} provider.search().success 的调用结果。
     */
    (resolve, reject) =>
      provider.search('/search?keywords=test&curpage=1&type=0').success(
        /**
         * 测试替身：调用 reject，依次传入 新建的 Error 实例，供用例观察调用与状态。
         * 无参数。
         * @returns {*} reject 回调的直接返回值。
         */
        () => reject(new Error('Unexpected success')),
        /**
         * 测试替身：调用 resolve 完成通知，供用例观察调用与状态。
         * @param error 被捕获或传入的异常；使用 code、businessCode 字段。
         * @returns {void} 无返回值。
         */
        (error) => {
          assert.equal(error.code, 'AUTH_REQUIRED');
          assert.equal(error.businessCode, 301);
          resolve();
        }
      )
  );
});

test('Kuwo and Migu keep punctuation inside the keyword query parameter' /**
 * 验证酷我与咪咕查询参数编码保留关键词内的标点；断言失败由测试运行器记录。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */, async () => {
  const keyword = 'A&B #中文+100%';
  for (const name of ['kuwo', 'migu']) {
    let captured;
    const context = vm.createContext({
      /**
       * 测试替身：执行 new URL().searchParams.get，供用例观察调用与状态。
       * @param key 索引、配置或字段名称。
       * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
       * @returns {*} new URL().searchParams.get 的调用结果。
       */
      getParameterByName: (key, url) =>
        new URL(url, 'https://example.invalid').searchParams.get(key),
      RequestTask: {
        /**
         * 测试替身：取得 包含 get 的对象，供用例观察调用与状态。
         * 无参数。
         * @returns {Object} 包含 get 的对象。
         */
        http: () => ({
          /**
           * 测试替身：更新 captured，供用例观察调用与状态。
           * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
           * @returns {Promise<Object>} 异步完成后得到 包含 data 的对象。
           */
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
      /**
       * 测试替身：更新 captured，调用 fn，依次传入 包含 data 的对象，供用例观察调用与状态。
       * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      provider.kw_cookie_get = (url, fn) => {
        captured = url;
        fn({ data: { abslist: [], HIT: 0 } });
      };
    await new Promise(
      /**
       * 启动当前异步操作，执行 provider.search().success，由 resolve／reject 决定 Promise 的结果。
       * @param resolve 用于兑现当前 Promise 的函数。
       * @param reject 用于拒绝当前 Promise 的函数。
       * @returns {*} provider.search().success 的调用结果。
       */
      (resolve, reject) =>
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
