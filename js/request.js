/* exported RequestTask */
// Cancellable operation shared by callback-based providers and the UI.
const RequestTask = (() => {
  let notify = () => {};
  const instances = new WeakSet();
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
  function instrument(instance) {
    if (instances.has(instance)) return instance;
    instances.add(instance);
    const { defaults } = instance;
    defaults.timeout = 15000;
    instance.interceptors.response.use(
      (response) => {
        notify();
        return response;
      },
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
    axios.create = (options) => instrument(createClient(options));
  }
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
    const promise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    promise.catch(() => {});
    let timer;
    function settle(next, result) {
      if (state !== 'pending') return;
      state = next;
      value =
        next === 'success' ? result : normalizeError(result, source, stage);
      clearTimeout(timer);
      controller.abort();
      cleanup.splice(0).forEach((fn) => fn());
      if (next === 'success') resolvePromise(value);
      else rejectPromise(value);
      (next === 'success' ? success : failure).forEach((fn) => fn(value));
      notify();
    }
    timer = setTimeout(() => settle('error', { code: 'TIMEOUT' }), timeout);
    const task = {
      promise,
      signal: controller.signal,
      success(fn) {
        if (state === 'success') fn(value);
        else if (state === 'pending') success.push(fn);
        return task;
      },
      error(fn) {
        if (state === 'error') fn(value);
        else if (state === 'pending') failure.push(fn);
        return task;
      },
      onProgress(fn) {
        if (lastProgress !== undefined) fn(lastProgress);
        if (state === 'pending') progress.push(fn);
        return task;
      },
      cancel() {
        settle('error', { code: 'CANCELLED' });
      },
    };
    try {
      const result = executor({
        resolve: (data) => settle('success', data),
        reject: (error) => settle('error', error),
        signal: controller.signal,
        onCleanup: (fn) => {
          if (state === 'pending') cleanup.push(fn);
          else fn();
        },
        progress: (data) => {
          if (state !== 'pending') return;
          lastProgress = data;
          progress.forEach((fn) => fn(data));
          notify();
        },
      });
      if (result?.catch) result.catch((error) => settle('error', error));
    } catch (error) {
      settle('error', error);
    }
    return task;
  }
  function legacy(start, options) {
    return create(({ resolve, reject, signal, onCleanup }) => {
      const operation = start({ signal });
      if (!operation || typeof operation.success !== 'function') {
        reject({ code: 'INVALID_RESPONSE' });
        return;
      }
      operation.success(resolve, reject);
      if (operation.error) operation.error(reject);
      if (operation.cancel) onCleanup(() => operation.cancel());
    }, options);
  }
  return {
    create,
    legacy,
    normalizeError,
    setNotifier(fn) {
      notify = fn;
    },
    http(options = {}) {
      return axios.create({ timeout: 15000, signal: options.signal });
    },
  };
})();
