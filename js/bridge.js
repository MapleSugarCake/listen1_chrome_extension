/**
 * 文件职责：在页面与播放器之间路由访问和消息，兼容同页播放及扩展后台播放，并提供监听清理函数。
 *
 * 文件级定义：
 * - getFrontPlayer：读取当前页面公开的 threadPlayer 实例。
 * - getBackgroundPlayer：同步读取扩展后台页的 threadPlayer 实例。
 * - getBackgroundPlayerAsync：通过扩展后台页回调取得播放器，并将实例交给调用方。
 * - getPlayer：根据 front／background 模式同步取得播放器。
 * - getPlayerAsync：根据模式取得播放器并执行调用方回调。
 * - frontPlayerListener：同页播放器事件订阅集合，注销时移除对应函数。
 * - addFrontPlayerListener：登记同页播放器监听，并返回只移除该监听的清理函数。
 * - addBackgroundPlayerListener：监听扩展运行时消息，仅转发 BG_PLAYER: 事件。
 * - addPlayerListener：按模式安装同页或后台播放器监听，并返回对应的注销函数。
 * - frontPlayerSendMessage：遍历监听器快照发送消息，避免回调中增删监听影响本轮分发。
 * - backgroundPlayerSendMessage：通过扩展运行时转发播放器消息。
 * - playerSendMessage：按目标模式分发播放器消息。
 */
/* eslint-disable no-unused-vars */
/* 连接页面与音频播放器。

front 模式在同一页面播放；background 模式通过扩展后台页播放，两者共用消息协议。 */

/**
 * 读取当前页面公开的 threadPlayer 实例。
 * 无参数。
 * @returns {*} window.threadPlayer。
 */
function getFrontPlayer() {
  return window.threadPlayer;
}

/**
 * 同步读取扩展后台页的 threadPlayer 实例。
 * 无参数。
 * @returns {*} chrome.extension.getBackgroundPage().threadPlayer。
 */
function getBackgroundPlayer() {
  return chrome.extension.getBackgroundPage().threadPlayer;
}

/**
 * 通过扩展后台页回调取得播放器，并将实例交给调用方。
 * @param callback 完成当前操作后调用的回调。
 * @returns {void} 无返回值。
 */
function getBackgroundPlayerAsync(callback) {
  (chrome || browser).runtime.getBackgroundPage(
    /**
     * 进入此回调后，调用 callback，依次传入 w.threadPlayer。
     * @param w 浏览器扩展后台页的 window 对象；使用 threadPlayer 字段。
     * @returns {void} 无返回值。
     */
    (w) => {
      callback(w.threadPlayer);
    }
  );
}

/**
 * 根据 front／background 模式同步取得播放器。
 * @param mode 前台／后台或播放模式值，按当前接口约定使用。
 * @returns {*} getFrontPlayer 的调用结果；其他分支返回 getBackgroundPlayer 的调用结果；其他分支返回 undefined。
 */
function getPlayer(mode) {
  if (mode === 'front') {
    return getFrontPlayer();
  }
  if (mode === 'background') {
    return getBackgroundPlayer();
  }
  return undefined;
}

/**
 * 根据模式取得播放器并执行调用方回调；返回回调或后台页 API 的直接结果。
 * @param mode 前台／后台或播放模式值，按当前接口约定使用。
 * @param callback 完成当前操作后调用的回调。
 * @returns {*} callback 回调的直接返回值；其他分支返回 getBackgroundPlayerAsync 的调用结果；其他分支返回 undefined。
 */
function getPlayerAsync(mode, callback) {
  if (mode === 'front') {
    const player = getFrontPlayer();
    return callback(player);
  }
  if (mode === 'background') {
    return getBackgroundPlayerAsync(callback);
  }
  return undefined;
}
/**
 * frontPlayerListener：同页播放器事件订阅集合，注销时移除对应函数；类型为 Array。
 * @type {Array}
 */
const frontPlayerListener = [];
/**
 * 登记同页播放器监听，并返回只移除该监听的清理函数。
 * @param listener 接收播放器消息的监听函数。
 * @returns {Function} 供后续调用的函数。
 */
function addFrontPlayerListener(listener) {
  frontPlayerListener.push(listener);
  /**
   * 进入此回调后，执行 frontPlayerListener.indexOf。
   * 无参数。
   * @returns {void} 无返回值。
   */
  return () => {
    const index = frontPlayerListener.indexOf(listener);
    if (index >= 0) frontPlayerListener.splice(index, 1);
  };
}

/**
 * 监听扩展运行时消息，仅转发 BG_PLAYER: 事件；返回解除监听的函数。
 * @param listener 接收播放器消息的监听函数。
 * @returns {Function} 供后续调用的函数。
 */
function addBackgroundPlayerListener(listener) {
  const { runtime } = typeof browser !== 'undefined' ? browser : chrome;
  /**
   * 过滤播放器消息，将消息、发送方及应答函数交给订阅者。
   * @param msg 播放器消息或通知内容；使用 type 字段。
   * @param sender 扩展消息的发送方信息。
   * @param res 异步响应或消息应答函数，按调用位置使用。
   * @returns {*} null；其他分支返回 listener 回调的直接返回值。
   */
  const handler = (msg, sender, res) => {
    if (!msg || !msg.type || !msg.type.startsWith('BG_PLAYER:')) {
      return null;
    }
    return listener(msg, sender, res);
  };
  runtime.onMessage.addListener(handler);
  /**
   * 进入此回调后，执行 runtime.onMessage.removeListener。
   * 无参数。
   * @returns {*} runtime.onMessage.removeListener 的调用结果。
   */
  return () => runtime.onMessage.removeListener(handler);
}

/**
 * 按模式安装同页或后台播放器监听，并返回对应的注销函数。
 * @param mode 前台／后台或播放模式值，按当前接口约定使用。
 * @param listener 接收播放器消息的监听函数。
 * @returns {*} addFrontPlayerListener 的调用结果；其他分支返回 addBackgroundPlayerListener 的调用结果；其他分支返回 null。
 */
function addPlayerListener(mode, listener) {
  if (mode === 'front') {
    return addFrontPlayerListener(listener);
  }
  if (mode === 'background') {
    return addBackgroundPlayerListener(listener);
  }
  return null;
}

/**
 * 遍历监听器快照发送消息，避免回调中增删监听影响本轮分发。
 * @param message 待转发的消息或文本。
 * @returns {void} 无返回值。
 */
function frontPlayerSendMessage(message) {
  frontPlayerListener.slice().forEach(
    /**
     * 逐项处理 frontPlayerListener.slice() 中的条目，执行 listener。
     * @param listener 来自 frontPlayerListener.slice() 的当前条目。
     * @returns {void} 无返回值。
     */
    (listener) => {
      listener(message);
    }
  );
}

/**
 * 通过扩展运行时转发播放器消息。
 * @param message 待转发的消息或文本。
 * @returns {void} 无返回值。
 */
function backgroundPlayerSendMessage(message) {
  (chrome || browser).runtime.sendMessage(message);
}

/**
 * 按目标模式分发播放器消息。
 * @param mode 前台／后台或播放模式值，按当前接口约定使用。
 * @param message 待转发的消息或文本。
 * @returns {void} 无返回值。
 */
function playerSendMessage(mode, message) {
  if (mode === 'front') {
    frontPlayerSendMessage(message);
  }
  if (mode === 'background') {
    backgroundPlayerSendMessage(message);
  }
}
