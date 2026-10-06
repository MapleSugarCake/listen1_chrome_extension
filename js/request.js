/**
 * 文件职责：提供带取消、超时和进度通知的请求任务，桥接旧 success/error 回调并统一 Axios 错误通知。
 *
 * 文件级定义：
 * - RequestTask：共享的请求任务工厂，提供取消、超时、进度和旧协议适配。
 */
/* exported RequestTask */
// 为旧回调来源与页面提供共享的可取消任务。
/**
 * RequestTask：共享的请求任务工厂，提供取消、超时、进度和旧协议适配；类型为 Object。
 * @type {Object}
 */
const RequestTask = (
  /**
   * 进入此回调后，更新 axios.create，执行 instrument。
   * 无参数。
   * @returns {Object} 包含 create、legacy、normalizeError、setNotifier、http 的对象。
   */
  () => {
    /**
     * 默认通知器；尚未注入页面刷新函数时不执行额外操作。
     * 无参数。
     * @returns {void} 无返回值。
     */
    let notify = () => {};
    const instances = new WeakSet();
    /**
     * 将网络、超时、取消及业务异常整理为带来源和阶段的统一错误对象。
     * @param error 原始异常或已经规范化的错误；使用 response、code、name、isAxiosError、businessCode 字段。
     * @param source 音乐来源名称。
     * @param stage 发生请求或错误的处理阶段。
     * @returns {Object} 含 code、message、source、stage 等字段的统一错误对象。
     */
    function normalizeError(error, source, stage) {
      const status = error?.response?.status;
      let code = error?.code;
      if (code === 'ECONNABORTED' || code === 'ETIMEDOUT') code = 'TIMEOUT';
      else if (code === 'ERR_CANCELED' || error?.name === 'AbortError')
        code = 'CANCELLED';
      else if (status === 401) code = 'AUTH_REQUIRED';
      else if (status === 429) code = 'RATE_LIMIT';
      else if (status === 403) code = 'ACCESS_DENIED';
      else if (status >= 500) code = 'SERVICE_ERROR';
      else if (status === 404 || status === 410) code = 'RESOURCE_UNAVAILABLE';
      else if (status >= 400) code = 'SERVICE_ERROR';
      else if (code === 'ERR_NETWORK' || error?.isAxiosError) code = 'NETWORK';
      else if (error instanceof TypeError || error instanceof SyntaxError)
        code = 'INVALID_RESPONSE';
      return {
        code: code || 'UNKNOWN',
        source,
        stage,
        status,
        businessCode: error?.businessCode,
        message: code || 'UNKNOWN',
      };
    }
    /**
     * 只为同一 Axios 实例安装一次超时默认值和通知拦截器，使用 WeakSet 避免重复安装。
     * @param instance 待安装统一拦截器的 Axios 实例；使用 interceptors 字段。
     * @returns {*} instance。
     */
    function instrument(instance) {
      if (instances.has(instance)) return instance;
      instances.add(instance);
      const { defaults } = instance;
      defaults.timeout = 15000;
      instance.interceptors.response.use(
        /**
         * 进入此回调后，执行 notify。
         * @param response 异步请求返回的响应对象。
         * @returns {*} response。
         */
        (response) => {
          notify();
          return response;
        },
        /**
         * 进入此回调后，执行 notify。
         * @param error 被捕获或传入的异常。
         * @returns {*} Promise.reject 的调用结果。
         */
        (error) => {
          notify();
          return Promise.reject(error);
        }
      );
      return instance;
    }
    if (typeof axios !== 'undefined') {
      instrument(axios);
      const createClient = axios.create.bind(axios);
      /**
       * 包装 Axios 实例工厂，使新实例也采用统一超时与错误通知。
       * @param options 本次操作选项。
       * @returns {*} instrument 的调用结果。
       */
      axios.create = (options) => instrument(createClient(options));
    }
    /**
     * 创建可取消任务，管理一次性结算、超时计时器、AbortSignal、进度及清理回调；旧式回调与 Promise 共享结果。
     * @param executor 任务执行器，接收 resolve、reject、signal、onCleanup 和 progress。
     * @param [options1] 解构参数，包含 source（音乐来源名称）、stage（发生请求或错误的处理阶段）、timeout（最长等待时间，单位为毫秒；默认值为 15000）；默认值为 空对象。
     * @returns {Object} 包含 promise、success、error、onProgress、cancel 等入口的请求任务。
     */
    function create(executor, { source, stage, timeout = 15000 } = {}) {
      const controller = new AbortController();
      const success = [];
      const failure = [];
      const progress = [];
      const cleanup = [];
      let state = 'pending';
      let value;
      let lastProgress;
      let resolvePromise;
      let rejectPromise;
      const promise = new Promise(
        /**
         * 启动当前异步操作，更新 resolvePromise、rejectPromise，由 resolve／reject 决定 Promise 的结果。
         * @param resolve 用于兑现当前 Promise 的函数。
         * @param reject 用于拒绝当前 Promise 的函数。
         * @returns {void} 无返回值。
         */
        (resolve, reject) => {
          resolvePromise = resolve;
          rejectPromise = reject;
        }
      );
      promise.catch(
        /**
         * 保留的空回调，此处无需继续处理或改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {}
      );
      let timer;
      /**
       * 只接受首次结算，终止请求、清理计时器及注册资源，再通知对应的成功或失败监听。
       * @param next 任务即将进入的结算状态。
       * @param result 前一步处理结果。
       * @returns {void} 无返回值。
       */
      function settle(next, result) {
        if (state !== 'pending') return;
        state = next;
        value =
          next === 'success' ? result : normalizeError(result, source, stage);
        clearTimeout(timer);
        controller.abort();
        cleanup.splice(0).forEach(
          /**
           * 逐项处理 cleanup.splice() 中的条目，fn 回调的直接返回值。
           * @param fn 来自 cleanup.splice() 的当前条目。
           * @returns {*} fn 回调的直接返回值。
           */
          (fn) => fn()
        );
        if (next === 'success') resolvePromise(value);
        else rejectPromise(value);
        (next === 'success' ? success : failure).forEach(
          /**
           * 逐项处理 next === 'success' ? success : failure 中的条目，fn 回调的直接返回值。
           * @param fn 来自 next === 'success' ? success : failure 的当前条目。
           * @returns {*} fn 回调的直接返回值。
           */
          (fn) => fn(value)
        );
        notify();
      }
      timer = setTimeout(
        /**
         * 在定时器或动画帧触发时，执行 settle（"error"）。
         * 无参数。
         * @returns {*} settle 的调用结果。
         */
        () => settle('error', { code: 'TIMEOUT' }),
        timeout
      );
      const task = {
        promise,
        signal: controller.signal,
        /**
         * 登记成功监听，任务已成功时立即回放结果；返回任务以支持链式调用。
         * @param fn 接收处理结果的回调函数。
         * @returns {*} 当前请求任务 task。
         */
        success(fn) {
          if (state === 'success') fn(value);
          else if (state === 'pending') success.push(fn);
          return task;
        },
        /**
         * 登记失败监听，任务已失败时立即回放错误；返回任务以支持链式调用。
         * @param fn 接收处理结果的回调函数。
         * @returns {*} 当前请求任务 task。
         */
        error(fn) {
          if (state === 'error') fn(value);
          else if (state === 'pending') failure.push(fn);
          return task;
        },
        /**
         * 登记进度监听，并在已有进度时立即回放最近快照。
         * @param fn 接收处理结果的回调函数。
         * @returns {*} 当前请求任务 task。
         */
        onProgress(fn) {
          if (lastProgress !== undefined) fn(lastProgress);
          if (state === 'pending') progress.push(fn);
          return task;
        },
        /**
         * 将待处理任务以 CANCELLED 错误结算，从而触发请求中止和清理。
         * 无参数。
         * @returns {void} 无返回值。
         */
        cancel() {
          settle('error', { code: 'CANCELLED' });
        },
      };
      try {
        const result = executor({
          /**
           * 以成功结果结算当前任务。
           * @param data 本次处理或转发的业务数据。
           * @returns {*} settle 的调用结果。
           */
          resolve: (data) => settle('success', data),
          /**
           * 规范化错误后将任务结算为失败。
           * @param error 被捕获或传入的异常。
           * @returns {*} settle 的调用结果。
           */
          reject: (error) => settle('error', error),
          signal: controller.signal,
          /**
           * 登记任务结束时执行的清理操作。
           * @param fn 接收处理结果的回调函数。
           * @returns {void} 无返回值。
           */
          onCleanup: (fn) => {
            if (state === 'pending') cleanup.push(fn);
            else fn();
          },
          /**
           * 缓存并广播尚未结算任务的进度，触发已注入的页面通知。
           * @param data 本次处理或转发的业务数据。
           * @returns {void} 无返回值。
           */
          progress: (data) => {
            if (state !== 'pending') return;
            lastProgress = data;
            progress.forEach(
              /**
               * 逐项处理 progress 中的条目，fn 回调的直接返回值。
               * @param fn 来自 progress 的当前条目。
               * @returns {*} fn 回调的直接返回值。
               */
              (fn) => fn(data)
            );
            notify();
          },
        });
        if (result?.catch)
          result.catch(
            /**
             * 异步操作失败后，执行 settle（"error"）。
             * @param error 被捕获或传入的异常。
             * @returns {*} settle 的调用结果。
             */
            (error) => settle('error', error)
          );
      } catch (error) {
        settle('error', error);
      }
      return task;
    }
    /**
     * 将旧 success/error/cancel 对象包装为统一任务，并把取消操作加入清理列表。
     * @param start 创建旧式回调请求的函数。
     * @param options 本次操作选项。
     * @returns {Object} 支持 Promise、回调及取消的统一请求任务。
     */
    function legacy(start, options) {
      return create(
        /**
         * 进入此回调后，调用 reject，依次传入 包含 code 的对象。
         * @param options 解构参数，包含 resolve（用于兑现当前 Promise 的函数）、reject（用于拒绝当前 Promise 的函数）、signal（请求任务的 AbortSignal，供取消在途请求）、onCleanup（登记任务结算时调用的无参数清理函数）。
         * @returns {void} 无返回值。
         */
        ({ resolve, reject, signal, onCleanup }) => {
          const operation = start({ signal });
          if (!operation || typeof operation.success !== 'function') {
            reject({ code: 'INVALID_RESPONSE' });
            return;
          }
          operation.success(resolve, reject);
          if (operation.error) operation.error(reject);
          if (operation.cancel)
            onCleanup(
              /**
               * 进入此回调后，执行 operation.cancel。
               * 无参数。
               * @returns {*} operation.cancel 的调用结果。
               */
              () => operation.cancel()
            );
        },
        options
      );
    }
    return {
      create,
      legacy,
      normalizeError,
      /**
       * 替换任务状态改变时调用的页面通知器。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      setNotifier(fn) {
        notify = fn;
      },
      /**
       * 创建携带当前取消信号的 Axios 实例。
       * @param [options] 本次操作选项；使用 signal 字段；默认值为 空对象。
       * @returns {Object} 携带指定取消信号并经过统一拦截器处理的 Axios 实例。
       */
      http(options = {}) {
        return axios.create({ timeout: 15000, signal: options.signal });
      },
    };
  }
)();
