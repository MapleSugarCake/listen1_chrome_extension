/**
 * 文件职责：验证任务的成功、失败、超时、取消、清理以及聚合搜索对旧回调提供者的适配。
 *
 * 文件级定义：
 * - test：从 node:test 引入，用于注册 Node 行为测试。
 * - assert：从 node:assert/strict 引入，用于断言测试结果。
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - vm：从 node:vm 引入，用于执行带受控全局对象的测试源码。
 * - harness：注入可覆盖的来源、计时器和缓存替身，装载统一请求及媒体服务供异步边界测试。
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
 * 注入可覆盖的来源、计时器和缓存替身，装载统一请求及媒体服务供异步边界测试。
 * @param [overrides] 覆盖默认测试替身的选项；默认值为 空对象。
 * @returns {*} vm.runInContext 的调用结果。
 */
function harness(overrides = {}) {
  const empty = {
    /**
     * 测试替身：取得 包含 success 的对象，供用例观察调用与状态。
     * 无参数。
     * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
     */
    search: () => ({
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 result、total、type 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn({ result: [], total: 0, type: 0 }),
    }),
    /**
     * 测试替身：执行 fail，供用例观察调用与状态。
     * @param track 统一曲目对象，包含用于路由和查找的 ID；当前函数体未使用，保留调用签名。
     * @param success 接收成功业务结果的回调；当前函数体未使用，保留调用签名。
     * @param fail 接收失败结果的测试回调。
     * @returns {*} fail 的调用结果。
     */
    bootstrap_track: (track, success, fail) => fail({ code: 'UNAVAILABLE' }),
  };
  const context = vm.createContext({
    AbortController,
    URLSearchParams,
    Promise,
    console,
    clearTimeout,
    /**
     * 测试替身：执行 setTimeout，供用例观察调用与状态。
     * @param fn 接收处理结果的回调函数。
     * @param ms 定时器等待时间，单位为毫秒。
     * @returns {*} setTimeout 的调用结果。
     */
    setTimeout: (fn, ms) => setTimeout(fn, ms / 100),
    LRUCache:
      /**
       * 测试中使用的 LRUCache 替身类，生命周期限于当前虚拟机用例。
       */
      class {
        /**
         * 测试替身：接受此处调用但不执行操作。
         * 无参数。
         * @returns {void} 无返回值。
         */
        get() {}
        /**
         * 测试替身：接受此处调用但不执行操作。
         * 无参数。
         * @returns {void} 无返回值。
         */
        set() {}
      },
    /**
     * 测试替身：接受此处调用但不执行操作。
     * 无参数。
     * @returns {void} 无返回值。
     */
    setPrototypeOfLocalStorage() {},
    localStorage: {
      /**
       * 测试替身：取得 true，供用例观察调用与状态。
       * 无参数。
       * @returns {boolean} true。
       */
      getObject: () => true,
    },
    /**
     * 测试替身：取得 按声明顺序组成的数组，供用例观察调用与状态。
     * 无参数。
     * @returns {Array} 按声明顺序组成的数组。
     */
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
      ].map(
        /**
         * 转换 [ 'netease', 'xiami', 'qq', 'kugou', 'kuwo', 'bilibili', 'migu', 'taihe', 'localmusic', 'myplaylist', ] 中的条目，按声明顺序组成的数组。
         * @param name 来自 [ 'netease', 'xiami', 'qq', 'kugou', 'kuwo', 'bilibili', 'migu', 'taihe', 'localmusic', 'myplaylist', ] 的当前条目。
         * @returns {Array} 按声明顺序组成的数组。
         */
        (name) => [name, empty]
      )
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

test('aggregation publishes successes before a stalled provider and finishes' /**
 * 验证聚合搜索先发布已成功来源的结果，停滞来源超时后能够收束；断言失败由测试运行器记录。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */, async () => {
  const { MediaService } = harness({
    netease: {
      /**
       * 测试替身：取得 包含 success 的对象，供用例观察调用与状态。
       * 无参数。
       * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
       */
      search: () => ({
        /**
         * 登记或执行旧式成功入口，调用 fn，依次传入 包含 result、total 的对象；业务结果通过 fn 传出。
         * @param fn 接收处理结果的回调函数。
         * @returns {*} fn 回调的直接返回值。
         */
        success: (fn) =>
          fn({ result: [{ id: 'netrack_1', source: 'netease' }], total: 1 }),
      }),
    },
    qq: {
      /**
       * 测试替身：取得 包含 success 的对象，供用例观察调用与状态。
       * 无参数。
       * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
       */
      search: () => ({
        /**
         * 测试替身：接受此处调用但不执行操作。
         * 无参数。
         * @returns {void} 无返回值。
         */
        success() {},
      }),
    },
  });
  const updates = [];
  const task = MediaService.search('allmusic', {
    keywords: 'song',
    curpage: 1,
    type: 0,
  }).onProgress(
    /**
     * 测试替身：执行 updates.push，供用例观察调用与状态。
     * @param value 待检查或转换的输入值。
     * @returns {number} 追加后的数组长度。
     */
    (value) => updates.push(value)
  );
  const result = await task.promise;
  assert.ok(
    updates.some(
      /**
       * 筛选检查 updates 中的条目，value.result.length 是否严格等于 1 且 value.sources.qq.state 是否严格等于 "pending"。
       * @param value 来自 updates 的当前条目；使用 result、sources 字段。
       * @returns {*} value.result.length 是否严格等于 1 且 value.sources.qq.state 是否严格等于 "pending"。
       */
      (value) =>
        value.result.length === 1 && value.sources.qq.state === 'pending'
    )
  );
  assert.equal(result.result.length, 1);
  assert.equal(result.sources.qq.state, 'error');
  assert.equal(result.sources.qq.code, 'TIMEOUT');
});

test('cancellation aborts the operation and ignores late success' /**
 * 验证取消会中断操作并忽略迟到的成功结果；断言失败由测试运行器记录。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */, async () => {
  const { RequestTask } = harness();
  let finish,
    signal,
    called = false;
  const task = RequestTask.create(
    /**
     * 测试替身：更新 finish、signal，供用例观察调用与状态。
     * @param context 请求任务提供的执行上下文，包含取消信号或结算入口；使用 resolve、signal 字段。
     * @returns {void} 无返回值。
     */
    (context) => {
      finish = context.resolve;
      signal = context.signal;
    }
  );
  task.success(
    /**
     * 测试替身：更新 called，供用例观察调用与状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    () => {
      called = true;
    }
  );
  task.cancel();
  finish('late');
  await assert.rejects(
    task.promise,
    /**
     * 测试替身：取得 error.code 是否严格等于 "CANCELLED"，供用例观察调用与状态。
     * @param error 被捕获或传入的异常；使用 code 字段。
     * @returns {boolean} error.code 是否严格等于 "CANCELLED"。
     */
    (error) => error.code === 'CANCELLED'
  );
  assert.equal(signal.aborted, true);
  assert.equal(called, false);
});

test('all fallback sources ending or stalling terminates once' /**
 * 验证备用来源全部结束或停滞时只结算一次；断言失败由测试运行器记录。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */, async () => {
  const { MediaService } = harness({
    qq: {
      /**
       * 测试替身：取得 包含 success 的对象，供用例观察调用与状态。
       * 无参数。
       * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
       */
      search: () => ({
        /**
         * 测试替身：接受此处调用但不执行操作。
         * 无参数。
         * @returns {void} 无返回值。
         */
        success() {},
      }),
    },
  });
  let successes = 0,
    failures = 0;
  const operation = MediaService.bootstrapTrack(
    { id: 'netrack_1', source: 'netease', title: 'T', artist: 'A' },
    /**
     * 测试替身：保留此调用位置的接口形状，供用例观察调用与状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    () => {
      successes++;
    },
    /**
     * 测试替身：保留此调用位置的接口形状，供用例观察调用与状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    () => {
      failures++;
    }
  );
  await assert.rejects(operation.promise);
  assert.equal(successes, 0);
  assert.equal(failures, 1);
});

test('provider pagination uses its page size and preserves unknown totals' /**
 * 验证分页使用来源实际页大小，并保留未知总数语义；断言失败由测试运行器记录。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */, async () => {
  const { MediaService } = harness({
    qq: {
      /**
       * 测试替身：取得 包含 success 的对象，供用例观察调用与状态。
       * 无参数。
       * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
       */
      search: () => ({
        /**
         * 登记或执行旧式成功入口，调用 fn，依次传入 包含 result、total 的对象；业务结果通过 fn 传出。
         * @param fn 接收处理结果的回调函数。
         * @returns {*} fn 回调的直接返回值。
         */
        success: (fn) => fn({ result: [], total: 100 }),
      }),
    },
    migu: {
      /**
       * 测试替身：取得 包含 success 的对象，供用例观察调用与状态。
       * 无参数。
       * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
       */
      search: () => ({
        /**
         * 登记或执行旧式成功入口，调用 fn，依次传入 包含 result、total 的对象；业务结果通过 fn 传出。
         * @param fn 接收处理结果的回调函数。
         * @returns {*} fn 回调的直接返回值。
         */
        success: (fn) => fn({ result: [], total: 1000 }),
      }),
    },
  });
  const qq = await MediaService.search('qq', { curpage: 2, type: 0 }).promise;
  assert.equal(qq.pageSize, 50);
  assert.equal(qq.hasMore, false);
  const migu = await MediaService.search('migu', { curpage: 1, type: 0 })
    .promise;
  assert.equal(migu.total, null);
});
