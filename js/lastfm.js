/**
 * 文件职责：封装 Last.fm 请求签名、授权会话、正在播放通知和收听记录提交，使用既有本地存储键。
 *
 * 文件级定义：
 * - options：Last.fm 请求使用的固定应用认证选项。
 * - apiUrl：Last.fm 服务接口地址。
 * - status：Last.fm 授权状态：0 未请求，1 待确认，2 已授权。
 * - generateSign：按排序后的参数键拼接值和共享签名材料，再计算 MD5。
 * - _isAuthRequested：检查本地是否已保存授权令牌。
 * - lastfm：Last.fm 静态服务，无需实例化；授权状态保存在模块闭包和本地存储。
 * - lastfm.getSession：优先返回缓存会话，否则以令牌换取会话并缓存。
 * - lastfm.getUserInfo：在有效会话下请求用户资料，按原有回调交出响应。
 * - lastfm.updateStatus：根据令牌和用户查询结果更新未授权、待确认或已授权状态。
 * - lastfm.getAuth：请求授权令牌并打开授权页，保存令牌后通过可选回调通知。
 * - lastfm.cancelAuth：清除本地令牌和会话并重置认证状态。
 * - lastfm.sendNowPlaying：取得会话并签名提交正在播放的歌曲及歌手。
 * - lastfm.scrobble：提交包含开始时间、歌曲、歌手和专辑的收听记录。
 * - lastfm.isAuthorized：检查状态是否为已授权。
 * - lastfm.isAuthRequested：检查状态是否已进入授权流程。
 * - lastfm.getStatusText：将当前授权状态映射为页面使用的状态文字。
 */
/* global forge */
// eslint-disable-next-line no-unused-vars
{
  /**
   * options：Last.fm 请求使用的固定应用认证选项；类型为 Object。
   * @type {Object}
   */
  const options = {
    apiKey: '6790c00a181128dc7c4ce06cd99d17c8',
    apiSecret: 'd68f1dfc6ff43044c96a79ae7dfb5c27',
  };

  /**
   * apiUrl：Last.fm 服务接口地址；类型为 string。
   * @type {string}
   */
  const apiUrl = 'https://ws.audioscrobbler.com/2.0/';

  /**
   * status：Last.fm 授权状态：0 未请求，1 待确认，2 已授权；类型为 number。
   * @type {number}
   */
  let status = 0;

  // 停用代码，保留供历史对照：
  // const publicApi = {
  //   getAuth,
  //   cancelAuth,
  //   getSession,
  //   sendNowPlaying,
  //   scrobble,
  //   getUserInfo,
  //   getStatusText,
  //   updateStatus,
  //   isAuthorized,
  //   isAuthRequested,
  // };


  /**
   * 按排序后的参数键拼接值和共享签名材料，再计算 MD5；沿用当前过滤表达式的实际行为。
   * @param params 当前请求或操作参数。
   * @returns {string} 按当前参数和签名材料计算的 MD5 十六进制摘要。
   */
  const generateSign = (params) => {
    const keys = Object.keys(params).filter(
      /**
       * 筛选检查 Object.keys() 中的条目，key 是否不等于 "format"，为空或假值时使用 key 是否不等于 "callback"。
       * @param key 来自 Object.keys() 的当前条目。
       * @returns {*} key 是否不等于 "format"，为空或假值时使用 key 是否不等于 "callback"。
       */
      (key) => key !== 'format' || key !== 'callback'
    );

    // 按字母顺序排列参数键。
    keys.sort();

    const o = keys.reduce(
      /**
       * 归并 keys 中的条目，r 加上 key 加上 params[key]。
       * @param r 上一步归并得到的累计结果。
       * @param key 来自 keys 的当前条目。
       * @returns {*} r 加上 key 加上 params[key]。
       */
      (r, key) => r + key + params[key], '');

    // 附加共享签名材料。
    return forge.md5
      .create()
      .update(forge.util.encodeUtf8(o + options.apiSecret))
      .digest()
      .toHex();
  };

  /**
   * 检查本地是否已保存授权令牌。
   * 无参数。
   * @returns {boolean} token 是否不等于 null。
   */
  // eslint-disable-next-line no-underscore-dangle
  const _isAuthRequested = () => {
    const token = localStorage.getObject('lastfmtoken');
    return token != null;
  };

  /**
   * Last.fm 静态服务，无需实例化；授权状态保存在模块闭包和本地存储。
   */
  // eslint-disable-next-line no-unused-vars
  class lastfm {
    /**
     * 优先返回缓存会话，否则以令牌换取会话并缓存；认证拒绝时通过回调返回 null。
     * @param callback 完成当前操作后调用的回调。
     * @returns {*} callback 回调的直接返回值；其他分支返回 null。
     */
    static getSession(callback) {
      // 从本地存储读取会话。
      let mySession = localStorage.getObject('lastfmsession');
      if (mySession != null) {
        return callback(mySession);
      }
      // 使用令牌换取会话。
      const token = localStorage.getObject('lastfmtoken');
      if (token == null) {
        return callback(null);
      }
      // 存在授权令牌。
      const params = {
        method: 'auth.getsession',
        api_key: options.apiKey,
        token,
      };
      params.api_sig = generateSign(params);
      params.format = 'json';

      axios
        .get(apiUrl, {
          params,
        })
        .then(
          /**
           * 上一步异步操作完成后，更新 mySession，调用 callback，依次传入 mySession。
           * @param response 异步请求返回的响应对象。
           * @returns {void} 无返回值。
           */
          (response) => {
          const { data } = response;
          mySession = data.session;
          localStorage.setObject('lastfmsession', mySession);
          callback(mySession);
        })
        .catch(
          /**
           * 异步操作失败后，调用 callback，依次传入 null。
           * @param error 被捕获或传入的异常；使用 response 字段。
           * @returns {void} 无返回值。
           */
          (error) => {
          if (error.response.status === 403) {
            callback(null);
          }
        });
      return null;
    }

    /**
     * 在有效会话下请求用户资料，按原有回调交出响应。
     * @param callback 完成当前操作后调用的回调。
     * @returns {void} 无返回值。
     */
    static getUserInfo(callback) {
      this.getSession(
        /**
         * 进入此回调后，更新 params.api_sig、params.format，调用 callback，依次传入 null。
         * @param session Last.fm 返回的授权会话，包含请求签名所需的会话键；使用 key 字段。
         * @returns {void} 无返回值。
         */
        (session) => {
        if (session == null) {
          callback(null);
          return;
        }
        const params = {
          method: 'user.getinfo',
          api_key: options.apiKey,
          sk: session.key,
        };

        params.api_sig = generateSign(params);
        params.format = 'json';

        axios
          .post(apiUrl, '', {
            params,
          })
          .then(
            /**
             * 上一步异步操作完成后，调用 callback，依次传入 data。
             * @param response 异步请求返回的响应对象。
             * @returns {void} 无返回值。
             */
            (response) => {
            const { data } = response;
            if (callback != null) {
              callback(data);
            }
          });
      });
    }

    /**
     * 根据令牌和用户查询结果更新未授权、待确认或已授权状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    static updateStatus() {
      // 授权状态。
      // 0：尚未请求授权。
      // 1：已经请求但尚未完成授权。
      // 2：已完成授权。
      if (!_isAuthRequested()) {
        status = 0;
        return;
      }
      this.getUserInfo(
        /**
         * 进入此回调后，更新 status。
         * @param data 本次处理或转发的业务数据。
         * @returns {void} 无返回值。
         */
        (data) => {
        if (data === null) {
          status = 1;
        } else {
          status = 2;
        }
      });
    }

    /**
     * 请求授权令牌并打开授权页，保存令牌后通过可选回调通知。
     * @param callback 完成当前操作后调用的回调。
     * @returns {void} 无返回值。
     */
    static getAuth(callback) {
      axios
        .get(apiUrl, {
          params: {
            method: 'auth.gettoken',
            api_key: options.apiKey,
            format: 'json',
          },
        })
        .then(
          /**
           * 上一步异步操作完成后，更新 status，调用 callback 完成通知。
           * @param response 异步请求返回的响应对象。
           * @returns {void} 无返回值。
           */
          (response) => {
          const { data } = response;
          const { token } = data;
          localStorage.setObject('lastfmtoken', token);
          const grant_url = `https://www.last.fm/api/auth/?api_key=${options.apiKey}&token=${token}`;
          window.open(grant_url, '_blank');
          status = 1;
          if (callback != null) {
            callback();
          }
        });
    }

    /**
     * 清除本地令牌和会话并重置认证状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    static cancelAuth() {
      localStorage.removeItem('lastfmsession');
      localStorage.removeItem('lastfmtoken');
      this.updateStatus();
    }

    /**
     * 取得会话并签名提交正在播放的歌曲及歌手。
     * @param track 统一曲目对象，包含用于路由和查找的 ID。
     * @param artist 歌手名称。
     * @param callback 完成当前操作后调用的回调。
     * @returns {void} 无返回值。
     */
    static sendNowPlaying(track, artist, callback) {
      this.getSession(
        /**
         * 进入此回调后，更新 params.api_sig、params.format，执行 axios.post().then。
         * @param session Last.fm 返回的授权会话，包含请求签名所需的会话键；使用 key 字段。
         * @returns {void} 无返回值。
         */
        (session) => {
        const params = {
          method: 'track.updatenowplaying',
          track,
          artist,
          api_key: options.apiKey,
          sk: session.key,
        };

        params.api_sig = generateSign(params);
        params.format = 'json';

        axios
          .post(apiUrl, '', {
            params,
          })
          .then(
            /**
             * 上一步异步操作完成后，调用 callback，依次传入 data。
             * @param response 异步请求返回的响应对象。
             * @returns {void} 无返回值。
             */
            (response) => {
            const { data } = response;
            if (callback != null) {
              callback(data);
            }
          });
      });
    }

    /**
     * 提交包含开始时间、歌曲、歌手和专辑的收听记录。
     * @param timestamp 收听开始的 Unix 时间戳，单位为秒。
     * @param track 统一曲目对象，包含用于路由和查找的 ID。
     * @param artist 歌手名称。
     * @param album 专辑名称。
     * @param callback 完成当前操作后调用的回调。
     * @returns {void} 无返回值。
     */
    static scrobble(timestamp, track, artist, album, callback) {
      this.getSession(
        /**
         * 进入此回调后，更新 params['album[0]']、params.api_sig、params.format，执行 axios.post().then。
         * @param session Last.fm 返回的授权会话，包含请求签名所需的会话键；使用 key 字段。
         * @returns {void} 无返回值。
         */
        (session) => {
        const params = {
          method: 'track.scrobble',
          'timestamp[0]': timestamp,
          'track[0]': track,
          'artist[0]': artist,
          api_key: options.apiKey,
          sk: session.key,
        };

        if (album !== '' && album != null) {
          params['album[0]'] = album;
        }

        params.api_sig = generateSign(params);
        params.format = 'json';

        axios
          .post(apiUrl, '', {
            params,
          })
          .then(
            /**
             * 上一步异步操作完成后，调用 callback，依次传入 data。
             * @param response 异步请求返回的响应对象。
             * @returns {void} 无返回值。
             */
            (response) => {
            const { data } = response;
            if (callback != null) {
              callback(data);
            }
          });
      });
    }

    /**
     * 检查状态是否为已授权。
     * 无参数。
     * @returns {boolean} status 是否严格等于 2。
     */
    static isAuthorized() {
      return status === 2;
    }

    /**
     * 检查状态是否已进入授权流程。
     * 无参数。
     * @returns {boolean} 对 status 是否严格等于 0 取反的布尔值。
     */
    static isAuthRequested() {
      return !(status === 0);
    }

    /**
     * 将当前授权状态映射为页面使用的状态文字。
     * 无参数。
     * @returns {string} "未连接"；其他分支返回 "连接中"；其他分支返回 "已连接"；其他分支返回 ""。
     */
    static getStatusText() {
      switch (status) {
        case 0:
          return '未连接';
        case 1:
          return '连接中';
        case 2:
          return '已连接';
        default:
          return '';
      }
    }
  }

  window.lastfm = lastfm;
}
