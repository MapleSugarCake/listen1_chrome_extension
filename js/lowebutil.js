/**
 * 文件职责：提供查询参数、运行环境、Cookie、JSON 本地存储和缓动滚动的共享兼容工具。
 *
 * 文件级定义：
 * - getParameterByName：从指定 URL 提取并解码查询参数。
 * - isElectron：通过专用桌面桥判断页面是否运行在桌面应用中。
 * - cookieGet：按桌面或扩展环境读取 Cookie，通过原有回调协议传出结果。
 * - cookieSet：按环境写入 Cookie，并通过回调接续调用链。
 * - cookieRemove：按环境删除命名 Cookie，并通过回调接续调用链。
 * - setPrototypeOfLocalStorage：向 Storage 原型安装 JSON 读写方法，保持现有存储键与序列化格式。
 * - getLocalStorageValue：读取 JSON 设置，只有缺失时使用默认值，保留 false、0 和空字符串等有效值。
 * - easeInOutQuad：根据已用时间计算二次缓入缓出的插值。
 * - smoothScrollTo：通过动画帧平滑调整元素 scrollTop，结束时精确设为目标位置。
 */
/* eslint-disable no-param-reassign */
/* eslint-disable no-unused-vars */

/**
 * 从指定 URL 提取并解码查询参数；未出现时返回 null，未赋值时返回空字符串。
 * @param name 待查找或注册的名称。
 * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
 * @returns {string|null} 解码后的参数；键缺失时为 null，无值时为空字符串。
 */
function getParameterByName(name, url) {
  if (!url) url = window.location.href;
  name = name.replace(/[[\]]/g, '\\$&');
  const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`);

  const results = regex.exec(url);
  if (!results) return null;
  if (!results[2]) return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

// 同一套来源代码同时用于浏览器扩展和 Electron。
// 此处屏蔽环境之间的 Cookie 等 API 差异，
// 使来源模块保持统一调用方式。
/**
 * 通过专用桌面桥判断页面是否运行在桌面应用中。
 * 无参数。
 * @returns {boolean} 是否存在可用的桌面桥。
 */
function isElectron() {
  return !!window.listen1Desktop;
}

/**
 * 按桌面或扩展环境读取 Cookie，通过原有回调协议传出结果。
 * @param cookieRequest 包含 Cookie 地址和名称的查询对象。
 * @param callback 完成当前操作后调用的回调。
 * @returns {*} chrome.cookies.get 的调用结果；其他分支返回 该异步链的 Promise。
 */
function cookieGet(cookieRequest, callback) {
  if (!isElectron()) {
    return chrome.cookies.get(
      cookieRequest,
      /**
       * 进入此回调后，调用 callback，依次传入 cookie。
       * @param cookie 待写入或删除的 Cookie 参数。
       * @returns {void} 无返回值。
       */
      (cookie) => {
        callback(cookie);
      }
    );
  }
  return window.listen1Desktop
    .cookieGet(cookieRequest)
    .then(callback)
    .catch(
      /**
       * 异步操作失败后，调用 callback，依次传入 null。
       * 无参数。
       * @returns {*} callback 回调的直接返回值。
       */
      () => callback(null)
    );
}

/**
 * 按环境写入 Cookie，并通过回调接续调用链。
 * @param cookie 待写入或删除的 Cookie 参数。
 * @param callback 完成当前操作后调用的回调。
 * @returns {*} chrome.cookies.set 的调用结果；其他分支返回 该异步链的 Promise。
 */
function cookieSet(cookie, callback) {
  if (!isElectron()) {
    return chrome.cookies.set(
      cookie,
      /**
       * 进入此回调后，调用 callback，依次传入 arg1、arg2。
       * @param arg1 浏览器 Cookie API 回调的第一个原始参数。
       * @param arg2 为兼容旧回调签名保留的第二个参数，浏览器通常不提供。
       * @returns {void} 无返回值。
       */
      (arg1, arg2) => {
        callback(arg1, arg2);
      }
    );
  }
  return window.listen1Desktop
    .cookieSet(cookie)
    .then(
      /**
       * 上一步异步操作完成后，调用 callback，依次传入 null。
       * 无参数。
       * @returns {*} callback 回调的直接返回值。
       */
      () => callback(null)
    )
    .catch(
      /**
       * 异步操作失败后，调用 callback，依次传入 null、error。
       * @param error 被捕获或传入的异常。
       * @returns {*} callback 回调的直接返回值。
       */
      (error) => callback(null, error)
    );
}
/**
 * 按环境删除命名 Cookie，并通过回调接续调用链。
 * @param cookie 待写入或删除的 Cookie 参数。
 * @param callback 完成当前操作后调用的回调。
 * @returns {*} chrome.cookies.remove 的调用结果；其他分支返回 该异步链的 Promise。
 */
function cookieRemove(cookie, callback) {
  if (!isElectron()) {
    return chrome.cookies.remove(
      cookie,
      /**
       * 进入此回调后，调用 callback，依次传入 arg1、arg2。
       * @param arg1 浏览器 Cookie API 回调的第一个原始参数。
       * @param arg2 为兼容旧回调签名保留的第二个参数，浏览器通常不提供。
       * @returns {void} 无返回值。
       */
      (arg1, arg2) => {
        callback(arg1, arg2);
      }
    );
  }
  return window.listen1Desktop
    .cookieRemove(cookie)
    .then(
      /**
       * 上一步异步操作完成后，调用 callback，依次传入 null。
       * 无参数。
       * @returns {*} callback 回调的直接返回值。
       */
      () => callback(null)
    )
    .catch(
      /**
       * 异步操作失败后，调用 callback，依次传入 null、error。
       * @param error 被捕获或传入的异常。
       * @returns {*} callback 回调的直接返回值。
       */
      (error) => callback(null, error)
    );
}

/**
 * 向 Storage 原型安装 JSON 读写方法，保持现有存储键与序列化格式。
 * 无参数。
 * @returns {void} 无返回值。
 */
function setPrototypeOfLocalStorage() {
  const proto = Object.getPrototypeOf(localStorage);
  /**
   * 读取指定键并解析 JSON；缺失或解析失败时返回 null。
   * @param key 索引、配置或字段名称。
   * @returns {*} 解析出的 JSON 值；缺失或解析失败时为 null。
   */
  proto.getObject = function getObject(key) {
    const value = this.getItem(key);
    try {
      return value && JSON.parse(value);
    } catch (error) {
      return null;
    }
  };
  /**
   * 将值序列化为 JSON 后写入指定键。
   * @param key 索引、配置或字段名称。
   * @param value 待检查或转换的输入值。
   * @returns {void} 无返回值。
   */
  proto.setObject = function setObject(key, value) {
    this.setItem(key, JSON.stringify(value));
  };
  Object.setPrototypeOf(localStorage, proto);
}

// 本地开关以 JSON 保存；读取时保留 false 等有效值，
// 仅在键缺失时回退默认值。
/**
 * 读取 JSON 设置，只有缺失时使用默认值，保留 false、0 和空字符串等有效值。
 * @param key 索引、配置或字段名称。
 * @param defaultValue 存储键缺失时采用的默认值。
 * @returns {*} 已存的 JSON 值，缺失时为 defaultValue。
 */
function getLocalStorageValue(key, defaultValue) {
  const keyString = localStorage.getItem(key);
  let result;
  try {
    result = keyString && JSON.parse(keyString);
  } catch {
    return defaultValue;
  }
  if (result === null) {
    result = defaultValue;
  }
  return result;
}

/**
 * 根据已用时间计算二次缓入缓出的插值。
 * @param t 当前已用时间，与 d 使用相同单位。
 * @param b 缓动起始值。
 * @param c 缓动变化总量。
 * @param d 缓动持续时间。
 * @returns {number} 当前时间点对应的缓动插值。
 */
function easeInOutQuad(t, b, c, d) {
  // t：当前已用时间。
  // b：起始值。
  // c：总变化量。
  // d：动画持续时间。
  t /= d / 2;
  if (t < 1) return (c / 2) * t * t + b;
  t -= 1;
  return (-c / 2) * (t * (t - 2) - 1) + b;
}

/**
 * 通过动画帧平滑调整元素 scrollTop，结束时精确设为目标位置。
 * @param element 指令绑定的元素或待滚动节点；使用 scrollTop 字段。
 * @param to 目标滚动位置。
 * @param duration 动画持续时间，单位为毫秒。
 * @returns {void} 无返回值。
 */
function smoothScrollTo(element, to, duration) {
  const start = element.scrollTop;
  const change = to - start;
  const startTime = performance.now();

  /**
   * 推进滚动插值，未到持续时间时继续申请动画帧。
   * @param currentTime 当前动画已用时间，单位为毫秒。
   * @returns {void} 无返回值。
   */
  const animateScroll = (currentTime) => {
    const timeElapsed = currentTime - startTime;
    const val = easeInOutQuad(timeElapsed, start, change, duration);
    element.scrollTop = val;
    if (timeElapsed < duration) {
      requestAnimationFrame(animateScroll);
    } else {
      element.scrollTop = to; // 动画结束时精确落在目标位置。
    }
  };
  requestAnimationFrame(animateScroll);
}
