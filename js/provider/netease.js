/**
 * 文件职责：适配网易云音乐的加密请求、搜索、完整歌单、歌词与用户接口，保持既有 ne 前缀 ID 协议。
 *
 * 文件级定义：
 * - netease：提供 netease 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 * - netease._create_secret_key：生成指定长度的随机字符密钥，供双层 AES 请求加密使用。
 * - netease._aes_encrypt：按给定算法和密钥执行 AES 加密，返回协议所需的编码文本。
 * - netease._rsa_encrypt：反转文本后按公钥指数和模数执行 RSA 运算，补齐协议要求的十六进制长度。
 * - netease.weapi：用固定密钥与随机密钥进行双层 AES 加密，并以 RSA 包装随机密钥，生成 weapi 请求字段。
 * - netease.eapi：拼接请求路径、JSON 和校验摘要，经 AES 加密生成 eapi 参数。
 * - netease.ne_show_toplist：读取网易云音乐榜单目录。
 * - netease.show_playlist：按偏移和分类读取网易云音乐歌单列表，返回供调用方登记完成回调的对象。
 * - netease.ne_ensure_cookie：检查必要 Cookie，缺失时补齐匿名标识。
 * - netease.async_process_list：为每项建立按原索引命名的异步任务，并行处理后按输入顺序重组结果。
 * - netease.ng_render_playlist_result_item：按单个旧曲目 ID 请求并转换详情，通过回调交出曲目。
 * - netease.ng_parse_playlist_tracks：批量查询曲目 ID 的详情并转换为统一曲目数组。
 * - netease.split_array：把数组按指定大小拆成顺序片段，不改变输入数组。
 * - netease.ne_get_playlist：先取歌单元信息和全部曲目 ID，再以每批 1000 项补全歌曲详情，合并为完整歌单。
 * - netease.bootstrap_track：把网易云音乐曲目解析为临时播放地址，通过 success 传出地址及来源信息。
 * - netease.is_playable：按当前费用字段判断曲目可用性，fee 为 1 或 4 时视为不可播放。
 * - netease.search：请求每页 20 项的歌曲或歌单搜索，校验业务状态后转换结果，总数沿用服务端值。
 * - netease.ne_album：读取网易云音乐专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
 * - netease.ne_artist：读取网易云音乐歌手资料与接口提供的歌曲列表，转换为统一列表详情。
 * - netease.lyric：读取网易云音乐原文和可用的译文歌词，沿用 lyric／tlyric 响应字段。
 * - netease.parse_url：识别网易云音乐分享链接并转换为内部列表 ID。
 * - netease.get_playlist：按列表 ID 前缀路由网易云音乐的歌单、专辑或歌手详情。
 * - netease.get_playlist_filters：提供网易云音乐的推荐分类与全部分类，通过 success 回调交出筛选结构。
 * - netease.login：根据手机或邮箱参数构造加密登录请求，密码先作 MD5，再通过旧回调返回用户状态。
 * - netease.get_user_playlist：分页查询用户歌单，按 subscribed 标记区分创建和收藏。
 * - netease.get_user_created_playlist：取得网易云音乐用户创建的歌单。
 * - netease.get_user_favorite_playlist：取得网易云音乐用户收藏的歌单。
 * - netease.get_recommend_playlist：取得网易云音乐推荐给当前会话的歌单。
 * - netease.get_user：读取网易云音乐当前登录用户，按统一 status 和 data 结构回传结果。
 * - netease.get_login_url：返回网易云音乐登录入口地址。
 * - netease.logout：清除网易云音乐使用的认证 Cookie。
 */
/* global RequestTask */
/* eslint-disable no-underscore-dangle */
/* eslint-disable no-unused-vars */
/* global getParameterByName forge */
/* global isElectron cookieSet cookieGet cookieRemove async */
// 来源通过共享静态接口供 MediaService 调用，
// 包括搜索、歌单、歌词、播放地址、链接解析和登录。
// 曲目 ID 保留 ne 前缀，因为服务按前缀路由。
/**
 * 提供 netease 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 */
class netease {
  /**
   * 生成指定长度的随机字符密钥，供双层 AES 请求加密使用。
   * @param size 目标长度或每批条目数量。
   * @returns {string} result.join 的调用结果。
   */
  static _create_secret_key(size) {
    const result = [];
    const choice = '012345679abcdef'.split('');
    for (let i = 0; i < size; i += 1) {
      const index = Math.floor(Math.random() * choice.length);
      result.push(choice[index]);
    }
    return result.join('');
  }

  /**
   * 按给定算法和密钥执行 AES 加密，返回协议所需的编码文本。
   * @param text 待处理的文本。
   * @param sec_key AES 加密密钥。
   * @param algo AES 算法模式。
   * @returns {*} cipher.output。
   */
  static _aes_encrypt(text, sec_key, algo) {
    const cipher = forge.cipher.createCipher(algo, sec_key);
    cipher.start({ iv: '0102030405060708' });
    cipher.update(forge.util.createBuffer(text));
    cipher.finish();

    return cipher.output;
  }

  /**
   * 反转文本后按公钥指数和模数执行 RSA 运算，补齐协议要求的十六进制长度。
   * @param text 待处理的文本。
   * @param pubKey RSA 公钥指数。
   * @param modulus RSA 公钥模数。
   * @returns {*} enc。
   */
  static _rsa_encrypt(text, pubKey, modulus) {
    text = text.split('').reverse().join(''); // eslint-disable-line no-param-reassign
    const n = new forge.jsbn.BigInteger(modulus, 16);
    const e = new forge.jsbn.BigInteger(pubKey, 16);
    const b = new forge.jsbn.BigInteger(forge.util.bytesToHex(text), 16);
    const enc = b.modPow(e, n).toString(16).padStart(256, '0');
    return enc;
  }

  /**
   * 用固定密钥与随机密钥进行双层 AES 加密，并以 RSA 包装随机密钥，生成 weapi 请求字段。
   * @param text 待处理的文本。
   * @returns {Object} data。
   */
  static weapi(text) {
    const modulus =
      '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b72' +
      '5152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbd' +
      'a92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe48' +
      '75d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';
    const nonce = '0CoJUm6Qyw8W8jud';
    const pubKey = '010001';
    text = JSON.stringify(text); // eslint-disable-line no-param-reassign
    const sec_key = this._create_secret_key(16);
    const enc_text = btoa(
      this._aes_encrypt(
        btoa(this._aes_encrypt(text, nonce, 'AES-CBC').data),
        sec_key,
        'AES-CBC'
      ).data
    );
    const enc_sec_key = this._rsa_encrypt(sec_key, pubKey, modulus);
    const data = {
      params: enc_text,
      encSecKey: enc_sec_key,
    };

    return data;
  }

  // 实现参考：https://github.com/Binaryify/NeteaseCloudMusicApi/blob/master/util/crypto.js
  /**
   * 拼接请求路径、JSON 和校验摘要，经 AES 加密生成 eapi 参数。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @param object 待 JSON 序列化并加密的接口请求对象。
   * @returns {Object} 包含 params 的对象。
   */
  static eapi(url, object) {
    const eapiKey = 'e82ckenh8dichen8';

    const text = typeof object === 'object' ? JSON.stringify(object) : object;
    const message = `nobody${url}use${text}md5forencrypt`;
    const digest = forge.md5
      .create()
      .update(forge.util.encodeUtf8(message))
      .digest()
      .toHex();
    const data = `${url}-36cd479b6b5-${text}-36cd479b6b5-${digest}`;

    return {
      params: this._aes_encrypt(data, eapiKey, 'AES-ECB').toHex().toUpperCase(),
    };
  }

  /**
   * 读取网易云音乐榜单目录；非首屏偏移直接返回空列表，避免重复追加。
   * @param offset 从列表开头跳过的条目数量。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static ne_show_toplist(offset) {
    if (offset !== undefined && offset > 0) {
      return {
        /**
         * 登记或执行旧式成功入口，调用 fn，依次传入 包含 result 的对象；业务结果通过 fn 传出。
         * @param fn 接收处理结果的回调函数。
         * @returns {*} fn 回调的直接返回值。
         */
        success: (fn) => fn({ result: [] }),
      };
    }
    const url = 'https://music.163.com/weapi/toplist/detail';
    const data = this.weapi({});
    return {
      /**
       * 登记或执行旧式成功入口，执行 axios.post().then().catch；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调为空操作。
       * @returns {void} 无返回值。
       */
      success: (
        fn,
        /**
         * 调用方未提供可选回调时使用的空处理器，不改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        failure = () => {}
      ) => {
        axios
          .post(url, new URLSearchParams(data))
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 result 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const result = [];
              response.data.list.forEach(
                /**
                 * 逐项处理 response.data.list 中的条目，执行 result.push。
                 * @param item 来自 response.data.list 的当前条目；使用 coverImgUrl、id、name 字段。
                 * @returns {void} 无返回值。
                 */
                (item) => {
                  const playlist = {
                    cover_img_url: item.coverImgUrl,
                    id: `neplaylist_${item.id}`,
                    source_url: `https://music.163.com/#/playlist?id=${item.id}`,
                    title: item.name,
                  };
                  result.push(playlist);
                }
              );
              return fn({ result });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 按偏移和分类读取网易云音乐歌单列表，返回供调用方登记完成回调的对象。
   * @param url 携带 offset、filter_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static show_playlist(url) {
    const order = 'hot';
    const offset = getParameterByName('offset', url);
    const filterId = getParameterByName('filter_id', url);

    if (filterId === 'toplist') {
      return this.ne_show_toplist(offset);
    }

    let filter = '';
    if (filterId !== '') {
      filter = `&cat=${filterId}`;
    }
    let target_url = '';
    if (offset != null) {
      target_url = `https://music.163.com/discover/playlist/?order=${order}${filter}&limit=35&offset=${offset}`;
    } else {
      target_url = `https://music.163.com/discover/playlist/?order=${order}${filter}`;
    }

    return {
      /**
       * 登记或执行旧式成功入口，执行 axios.get().then().catch；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调为空操作。
       * @returns {void} 无返回值。
       */
      success: (
        fn,
        /**
         * 调用方未提供可选回调时使用的空处理器，不改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        failure = () => {}
      ) => {
        axios
          .get(target_url)
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 result 的对象。
             * @param response 异步请求返回的响应对象。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response;
              const list_elements = Array.from(
                new DOMParser()
                  .parseFromString(data, 'text/html')
                  .getElementsByClassName('m-cvrlst')[0].children
              );
              const result = list_elements.map(
                /**
                 * 转换 list_elements 中的条目，包含 cover_img_url、title、id、source_url 的对象。
                 * @param item 来自 list_elements 的当前条目；使用 getElementsByTagName 字段。
                 * @returns {Object} 包含 cover_img_url、title、id、source_url 的对象。
                 */
                (item) => ({
                  cover_img_url: item
                    .getElementsByTagName('img')[0]
                    .src.replace('140y140', '512y512'),

                  title: item
                    .getElementsByTagName('div')[0]
                    .getElementsByTagName('a')[0].title,
                  id: `neplaylist_${getParameterByName(
                    'id',
                    item
                      .getElementsByTagName('div')[0]
                      .getElementsByTagName('a')[0].href
                  )}`,
                  source_url: `https://music.163.com/#/playlist?id=${getParameterByName(
                    'id',
                    item
                      .getElementsByTagName('div')[0]
                      .getElementsByTagName('a')[0].href
                  )}`,
                })
              );
              return fn({
                result,
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 检查必要 Cookie，缺失时补齐匿名标识；无论是否需要写入均继续回调，桌面有效期仍受主进程限制。
   * @param callback 完成当前操作后调用的回调。
   * @returns {void} 无返回值。
   */
  static ne_ensure_cookie(callback) {
    const domain = 'https://music.163.com';
    const nuidName = '_ntes_nuid';
    const nnidName = '_ntes_nnid3';
    const nuidValue = this._create_secret_key(32);
    const nnidValue = `${nuidValue},${new Date().getTime()}`;
    const nmtidName = 'NMTID';
    const nmtidValue = '0';

    // 按旧逻辑请求一百年的 Cookie 有效期；桌面写入仍受主进程上限约束。
    const expire =
      (new Date().getTime() + 1e3 * 60 * 60 * 24 * 365 * 100) / 1000;
    async.concat(
      [
        { url: domain, name: nuidName },
        { url: domain, name: nnidName },
        { url: domain, name: nmtidName },
      ],
      /**
       * 进入此回调后，执行 cookieGet。
       * @param item 当前遍历或处理的条目。
       * @param cb 通知当前异步子任务完成的回调。
       * @returns {void} 无返回值。
       */
      (item, cb) => {
        cookieGet(
          item,
          /**
           * 进入此回调后，调用 cb，依次传入 null、整理后的结果 result。
           * @param result 前一步处理结果。
           * @returns {*} cb 回调的直接返回值。
           */
          (result) => cb(null, result)
        );
      },
      /**
       * 进入此回调后，调用 callback，依次传入 null。
       * @param _ 保留测试替身的调用签名，当前实现未使用；当前函数体未使用，保留调用签名。
       * @param results 批量操作的结果集合。
       * @returns {void} 无返回值。
       */
      (_, results) => {
        if (
          results.filter(
            /**
             * 筛选检查 results 中的条目，i 是否严格等于 null。
             * @param i 来自 results 的当前条目。
             * @returns {boolean} i 是否严格等于 null。
             */
            (i) => i === null
          ).length > 0
        ) {
          async.concat(
            [
              {
                url: domain,
                name: nuidName,
                value: nuidValue,
                expirationDate: expire,
                sameSite: 'no_restriction',
                secure: true, // 为桌面跨站 Cookie 请求补入相应属性。
              },
              {
                url: domain,
                name: nnidName,
                value: nnidValue,
                expirationDate: expire,
                sameSite: 'no_restriction',
                secure: true, // 为桌面跨站 Cookie 请求补入相应属性。
              },
              {
                url: domain,
                name: nmtidName,
                value: nmtidValue,
                expirationDate: expire,
                sameSite: 'no_restriction',
                secure: true, // 为桌面跨站 Cookie 请求补入相应属性。
              },
            ],
            cookieSet,
            /**
             * 进入此回调后，调用 callback，依次传入 null。
             * 无参数。
             * @returns {void} 无返回值。
             */
            () => {
              callback(null);
            }
          );
        } else {
          // 已有 Cookie 仍需执行后续回调，
          // 防止请求链停在此处。
          callback(null);
        }
      }
    );
  }

  /**
   * 为每项建立按原索引命名的异步任务，并行处理后按输入顺序重组结果；沿用现有回调错误处理。
   * @param data_list 保持原顺序的待处理列表。
   * @param handler 处理单个条目的函数。
   * @param handler_extra_param_list 传给条目处理函数的附加参数数组。
   * @param callback 完成当前操作后调用的回调。
   * @returns {void} 无返回值。
   */
  static async_process_list(
    data_list,
    handler,
    handler_extra_param_list,
    callback
  ) {
    const fnDict = {};
    data_list.forEach(
      /**
       * 逐项处理 data_list 中的条目，更新 fnDict[index]。
       * @param item 来自 data_list 的当前条目。
       * @param index 当前条目的零起点索引。
       * @returns {void} 无返回值。
       */
      (item, index) => {
        /**
         * 将当前条目、原始索引和附加参数交给处理器，并以 cb 通知并行任务完成。
         * @param cb 通知当前异步子任务完成的回调。
         * @returns {*} handler 的调用结果。
         */
        fnDict[index] = (cb) =>
          handler(index, item, handler_extra_param_list, cb);
      }
    );
    async.parallel(
      fnDict,
      /**
       * 进入此回调后，调用 callback，依次传入 null、逐项转换后的数组。
       * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
       * @param results 批量操作的结果集合。
       * @returns {*} callback 回调的直接返回值。
       */
      (err, results) =>
        callback(
          null,
          data_list.map(
            /**
             * 转换 data_list 中的条目，results[index]。
             * @param item 来自 data_list 的当前条目；当前函数体未使用，保留调用签名。
             * @param index 当前条目的零起点索引。
             * @returns {*} results[index]。
             */
            (item, index) => results[index]
          )
        )
    );
  }

  /**
   * 按单个旧曲目 ID 请求并转换详情，通过回调交出曲目。
   * @param index 当前条目的零起点索引；当前函数体未使用，保留调用签名。
   * @param item 当前遍历或处理的条目；使用 id 字段。
   * @param callback 完成当前操作后调用的回调。
   * @returns {void} 无返回值。
   */
  static ng_render_playlist_result_item(index, item, callback) {
    const target_url = 'https://music.163.com/weapi/v3/song/detail';
    const queryIds = [item.id];
    const d = {
      c: `[${queryIds
        .map(
          /**
           * 转换 queryIds 中的条目，按当前字段拼接的字符串。
           * @param id 来自 queryIds 的当前条目。
           * @returns {string} 按当前字段拼接的字符串。
           */
          (id) => `{"id":${id}}`
        )
        .join(',')}]`,
      ids: `[${queryIds.join(',')}]`,
    };
    const data = this.weapi(d);
    axios.post(target_url, new URLSearchParams(data).toString()).then(
      /**
       * 上一步异步操作完成后，调用 callback，依次传入 null、统一曲目对象 track。
       * @param response 异步请求返回的响应对象；使用 data 字段。
       * @returns {*} callback 回调的直接返回值。
       */
      (response) => {
        const track_json = response.data.songs[0];
        const track = {
          id: `netrack_${track_json.id}`,
          title: track_json.name,
          artist: track_json.ar[0].name,
          artist_id: `neartist_${track_json.ar[0].id}`,
          album: track_json.al.name,
          album_id: `nealbum_${track_json.al.id}`,
          source: 'netease',
          source_url: `https://music.163.com/#/song?id=${track_json.id}`,
          img_url: track_json.al.picUrl,
          // 停用代码，保留供历史对照：
          // url: `netrack_${track_json.id}`,
        };
        return callback(null, track);
      }
    );
  }

  /**
   * 批量查询曲目 ID 的详情并转换为统一曲目数组。
   * @param playlist_tracks 待批量补全的曲目 ID 记录。
   * @param callback 完成当前操作后调用的回调。
   * @returns {void} 无返回值。
   */
  static ng_parse_playlist_tracks(playlist_tracks, callback) {
    const target_url = 'https://music.163.com/weapi/v3/song/detail';
    const track_ids = playlist_tracks.map(
      /**
       * 转换 playlist_tracks 中的条目，i.id。
       * @param i 来自 playlist_tracks 的当前条目；使用 id 字段。
       * @returns {*} i.id。
       */
      (i) => i.id
    );
    const d = {
      c: `[${track_ids
        .map(
          /**
           * 转换 track_ids 中的条目，按当前字段拼接的字符串。
           * @param id 来自 track_ids 的当前条目。
           * @returns {string} 按当前字段拼接的字符串。
           */
          (id) => `{"id":${id}}`
        )
        .join(',')}]`,
      ids: `[${track_ids.join(',')}]`,
    };
    const data = this.weapi(d);
    axios.post(target_url, new URLSearchParams(data)).then(
      /**
       * 上一步异步操作完成后，调用 callback，依次传入 null、曲目数组 tracks。
       * @param response 异步请求返回的响应对象；使用 data 字段。
       * @returns {*} callback 回调的直接返回值。
       */
      (response) => {
        const tracks = response.data.songs.map(
          /**
           * 转换 response.data.songs 中的条目，包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url 的对象。
           * @param track_json 来自 response.data.songs 的当前条目；使用 id、name、ar、al 字段。
           * @returns {Object} 包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url 的对象。
           */
          (track_json) => ({
            id: `netrack_${track_json.id}`,
            title: track_json.name,
            artist: track_json.ar[0].name,
            artist_id: `neartist_${track_json.ar[0].id}`,
            album: track_json.al.name,
            album_id: `nealbum_${track_json.al.id}`,
            source: 'netease',
            source_url: `https://music.163.com/#/song?id=${track_json.id}`,
            img_url: track_json.al.picUrl,
            // 停用代码，保留供历史对照：
            // url: `netrack_${track_json.id}`,
          })
        );

        return callback(null, tracks);
      }
    );
  }

  /**
   * 把数组按指定大小拆成顺序片段，不改变输入数组。
   * @param myarray 待拆分的输入数组。
   * @param size 目标长度或每批条目数量。
   * @returns {Array} 整理后的结果 result。
   */
  static split_array(myarray, size) {
    const count = Math.ceil(myarray.length / size);
    const result = [];
    for (let i = 0; i < count; i += 1) {
      result.push(myarray.slice(i * size, (i + 1) * size));
    }
    return result;
  }

  /**
   * 先取歌单元信息和全部曲目 ID，再以每批 1000 项补全歌曲详情，合并为完整歌单。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static ne_get_playlist(url) {
    // 感谢 @Binaryify 提供的参考实现。
    // https://github.com/Binaryify/NeteaseCloudMusicApi
    return {
      /**
       * 登记或执行旧式成功入口，执行 getParameterByName().split().pop；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调为空操作。
       * @returns {void} 无返回值。
       */
      success: (
        fn,
        /**
         * 调用方未提供可选回调时使用的空处理器，不改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        failure = () => {}
      ) => {
        const list_id = getParameterByName('list_id', url).split('_').pop();
        const target_url = 'https://music.163.com/weapi/v3/playlist/detail';
        const d = {
          id: list_id,
          offset: 0,
          total: true,
          limit: 1000,
          n: 1000,
          csrf_token: '',
        };
        const data = this.weapi(d);
        this.ne_ensure_cookie(
          /**
           * 进入此回调后，执行 axios.post().then().catch。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            axios
              .post(target_url, new URLSearchParams(data))
              .then(
                /**
                 * 上一步异步操作完成后，执行 this.split_array。
                 * @param response 异步请求返回的响应对象。
                 * @returns {void} 无返回值。
                 */
                (response) => {
                  const { data: res_data } = response;
                  const info = {
                    id: `neplaylist_${list_id}`,
                    cover_img_url: res_data.playlist.coverImgUrl,
                    title: res_data.playlist.name,
                    source_url: `https://music.163.com/#/playlist?id=${list_id}`,
                  };
                  const max_allow_size = 1000;
                  const trackIdsArray = this.split_array(
                    res_data.playlist.trackIds,
                    max_allow_size
                  );

                  /**
                   * 将一批曲目 ID 交给详情解析器，适配异步拼接库的回调签名。
                   * @param trackIds 当前批次的曲目 ID 数组。
                   * @param callback 完成当前操作后调用的回调。
                   * @returns {*} netease.ng_parse_playlist_tracks 的调用结果。
                   */
                  function ng_parse_playlist_tracks_wrapper(
                    trackIds,
                    callback
                  ) {
                    return netease.ng_parse_playlist_tracks(trackIds, callback);
                  }

                  async.concat(
                    trackIdsArray,
                    ng_parse_playlist_tracks_wrapper,
                    /**
                     * 进入此回调后，调用 fn，依次传入 包含 tracks、info 的对象。
                     * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
                     * @param tracks 保持来源或调用方顺序的曲目数组。
                     * @returns {void} 无返回值。
                     */
                    (err, tracks) => {
                      fn({ tracks, info });
                    }
                  );

                  // 保留逐首补全曲目详情的旧方案。
                  // 停用代码，保留供历史对照：
                  // async_process_list(res_data.playlist.trackIds, ng_render_playlist_result_item,
                  //   (err, tracks) => fn({
                  //     tracks,
                  //     info,
                  //   }));
                }
              )
              .catch(failure);
          }
        );
      },
    };
  }

  /**
   * 把网易云音乐曲目解析为临时播放地址，通过 success 传出地址及来源信息；不可用或请求失败时调用 failure。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 id 字段。
   * @param success 接收成功业务结果的回调。
   * @param failure 接收失败原因的回调；省略时沿用声明中的默认处理。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {void} 无返回值。
   */
  static bootstrap_track(track, success, failure, options = {}) {
    const request = RequestTask.http(options);
    // 来源将统一曲目转换为短期可用的播放 URL，
    // 无法解析时调用 failure，
    // 由 MediaService 决定是否尝试其他来源。
    const sound = {};
    const target_url = `https://interface3.music.163.com/eapi/song/enhance/player/url`;
    let song_id = track.id;
    const eapiUrl = '/api/song/enhance/player/url';

    song_id = song_id.slice('netrack_'.length);

    const d = {
      ids: `[${song_id}]`,
      br: 999000,
    };
    const data = this.eapi(eapiUrl, d);
    const expire =
      (new Date().getTime() + 1e3 * 60 * 60 * 24 * 365 * 100) / 1000;

    cookieSet(
      {
        url: 'https://interface3.music.163.com',
        name: 'os',
        value: 'pc',
        expirationDate: expire,
      },
      /**
       * 进入此回调后，执行 request.post().then().catch。
       * @param cookie 待写入或删除的 Cookie 参数；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      (cookie) => {
        request
          .post(target_url, new URLSearchParams(data))
          .then(
            /**
             * 上一步异步操作完成后，更新 sound.url、sound.bitrate、sound.platform，调用 success，依次传入 播放地址对象 sound。
             * @param response 异步请求返回的响应对象。
             * @returns {void} 无返回值。
             */
            (response) => {
              const { data: res_data } = response;
              const { url, br } = res_data.data[0];
              if (url != null) {
                sound.url = url;
                const bitrate = `${(br / 1000).toFixed(0)}kbps`;
                sound.bitrate = bitrate;
                sound.platform = 'netease';

                success(sound);
              } else {
                failure(sound);
              }
            }
          )
          .catch(failure);
      }
    );
  }

  /**
   * 按当前费用字段判断曲目可用性，fee 为 1 或 4 时视为不可播放。
   * @param song 来源歌曲记录或当前页面曲目；使用 fee 字段。
   * @returns {*} song.fee 是否不等于 4 且 song.fee 是否不等于 1。
   */
  static is_playable(song) {
    return song.fee !== 4 && song.fee !== 1;
  }

  /**
   * 请求每页 20 项的歌曲或歌单搜索，校验业务状态后转换结果，总数沿用服务端值。
   * @param url 携带 keywords、curpage、type 查询参数的内部请求地址。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static search(url, options = {}) {
    const request = RequestTask.http(options);
    // 请求头由所在桌面或扩展环境的适配层处理。
    const target_url = 'https://music.163.com/api/search/pc';
    const keyword = getParameterByName('keywords', url);
    const curpage = getParameterByName('curpage', url);
    const searchType = getParameterByName('type', url);
    let ne_search_type = '1';
    if (searchType === '1') {
      ne_search_type = '1000';
    }
    const req_data = {
      s: keyword,
      offset: 20 * (curpage - 1),
      limit: 20,
      type: ne_search_type,
    };
    return {
      /**
       * 登记或执行旧式成功入口，执行 this.ne_ensure_cookie；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调为空操作。
       * @returns {void} 无返回值。
       */
      success: (
        fn,
        /**
         * 调用方未提供可选回调时使用的空处理器，不改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        failure = () => {}
      ) => {
        this.ne_ensure_cookie(
          /**
           * 进入此回调后，执行 request.post().then().catch。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            request
              .post(target_url, new URLSearchParams(req_data))
              .then(
                /**
                 * 上一步异步操作完成后，更新 result、total，调用 failure，依次传入 包含 code、businessCode 的对象。
                 * @param response 异步请求返回的响应对象。
                 * @returns {*} undefined；其他分支返回 fn 回调的直接返回值。
                 */
                (response) => {
                  const { data } = response;
                  if (!data || typeof data !== 'object')
                    throw new TypeError('Invalid search response');
                  if (data.code !== undefined && data.code !== 200) {
                    const code =
                      { 301: 'AUTH_REQUIRED', 429: 'RATE_LIMIT' }[data.code] ||
                      'SERVICE_ERROR';
                    failure({ code, businessCode: data.code });
                    return undefined;
                  }
                  let result = [];
                  let total = 0;
                  if (searchType === '0') {
                    result = (data.result?.songs || []).map(
                      /**
                       * 转换 data.result?.songs || [] 中的条目，包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、url 的对象。
                       * @param song_info 来自 data.result?.songs || [] 的当前条目；使用 id、name、artists、album 字段。
                       * @returns {Object} 包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、url 的对象。
                       */
                      (song_info) => ({
                        id: `netrack_${song_info.id}`,
                        title: song_info.name,
                        artist: song_info.artists[0].name,
                        artist_id: `neartist_${song_info.artists[0].id}`,
                        album: song_info.album.name,
                        album_id: `nealbum_${song_info.album.id}`,
                        source: 'netease',
                        source_url: `https://music.163.com/#/song?id=${song_info.id}`,
                        img_url: song_info.album.picUrl,
                        // 停用代码，保留供历史对照：
                        // url: `netrack_${song_info.id}`,
                        url: !this.is_playable(song_info) ? '' : undefined,
                      })
                    );
                    total = data.result?.songCount || 0;
                  } else if (searchType === '1') {
                    result = (data.result?.playlists || []).map(
                      /**
                       * 转换 data.result?.playlists || [] 中的条目，包含 id、title、source、source_url、img_url、url、author、count 的对象。
                       * @param info 来自 data.result?.playlists || [] 的当前条目；使用 id、name、coverImgUrl、creator、trackCount 字段。
                       * @returns {Object} 包含 id、title、source、source_url、img_url、url、author、count 的对象。
                       */
                      (info) => ({
                        id: `neplaylist_${info.id}`,
                        title: info.name,
                        source: 'netease',
                        source_url: `https://music.163.com/#/playlist?id=${info.id}`,
                        img_url: info.coverImgUrl,
                        url: `neplaylist_${info.id}`,
                        author: info.creator.nickname,
                        count: info.trackCount,
                      })
                    );
                    total = data.result?.playlistCount || 0;
                  }

                  return fn({
                    result,
                    total,
                    type: searchType,
                  });
                }
              )
              .catch(failure);
          }
        );
      },
    };
  }

  /**
   * 读取网易云音乐专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static ne_album(url) {
    const album_id = getParameterByName('list_id', url).split('_').pop();
    // 请求头由所在桌面或扩展环境的适配层处理。
    const target_url = `https://music.163.com/api/album/${album_id}`;

    return {
      /**
       * 登记或执行旧式成功入口，执行 axios.get().then().catch；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调为空操作。
       * @returns {void} 无返回值。
       */
      success: (
        fn,
        /**
         * 调用方未提供可选回调时使用的空处理器，不改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        failure = () => {}
      ) => {
        axios
          .get(target_url)
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 tracks、info 的对象。
             * @param response 异步请求返回的响应对象。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response;
              const info = {
                cover_img_url: data.album.picUrl,
                title: data.album.name,
                id: `nealbum_${data.album.id}`,
                source_url: `https://music.163.com/#/album?id=${data.album.id}`,
              };

              const tracks = data.album.songs.map(
                /**
                 * 转换 data.album.songs 中的条目，包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、url 的对象。
                 * @param song_info 来自 data.album.songs 的当前条目；使用 id、name、artists、album 字段。
                 * @returns {Object} 包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、url 的对象。
                 */
                (song_info) => ({
                  id: `netrack_${song_info.id}`,
                  title: song_info.name,
                  artist: song_info.artists[0].name,
                  artist_id: `neartist_${song_info.artists[0].id}`,
                  album: song_info.album.name,
                  album_id: `nealbum_${song_info.album.id}`,
                  source: 'netease',
                  source_url: `https://music.163.com/#/song?id=${song_info.id}`,
                  img_url: song_info.album.picUrl,
                  url: !this.is_playable(song_info) ? '' : undefined,
                })
              );
              return fn({
                tracks,
                info,
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 读取网易云音乐歌手资料与接口提供的歌曲列表，转换为统一列表详情。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static ne_artist(url) {
    const artist_id = getParameterByName('list_id', url).split('_').pop();
    // 请求头由所在桌面或扩展环境的适配层处理。
    const target_url = `https://music.163.com/api/artist/${artist_id}`;

    return {
      /**
       * 登记或执行旧式成功入口，执行 axios.get().then().catch；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调为空操作。
       * @returns {void} 无返回值。
       */
      success: (
        fn,
        /**
         * 调用方未提供可选回调时使用的空处理器，不改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        failure = () => {}
      ) => {
        axios
          .get(target_url)
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 tracks、info 的对象。
             * @param response 异步请求返回的响应对象。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response;
              const info = {
                cover_img_url: data.artist.picUrl,
                title: data.artist.name,
                id: `neartist_${data.artist.id}`,
                source_url: `https://music.163.com/#/artist?id=${data.artist.id}`,
              };

              const tracks = data.hotSongs.map(
                /**
                 * 转换 data.hotSongs 中的条目，包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、url 的对象。
                 * @param song_info 来自 data.hotSongs 的当前条目；使用 id、name、artists、album 字段。
                 * @returns {Object} 包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、url 的对象。
                 */
                (song_info) => ({
                  id: `netrack_${song_info.id}`,
                  title: song_info.name,
                  artist: song_info.artists[0].name,
                  artist_id: `neartist_${song_info.artists[0].id}`,
                  album: song_info.album.name,
                  album_id: `nealbum_${song_info.album.id}`,
                  source: 'netease',
                  source_url: `https://music.163.com/#/song?id=${song_info.id}`,
                  img_url: song_info.album.picUrl,
                  // 停用代码，保留供历史对照：
                  // url: `netrack_${song_info.id}`,
                  url: !this.is_playable(song_info) ? '' : undefined,
                })
              );
              return fn({
                tracks,
                info,
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 读取网易云音乐原文和可用的译文歌词，沿用 lyric／tlyric 响应字段。
   * @param url 携带 track_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lyric(url) {
    const track_id = getParameterByName('track_id', url).split('_').pop();
    // 请求头由所在桌面或扩展环境的适配层处理。
    const target_url = 'https://music.163.com/weapi/song/lyric?csrf_token=';
    const csrf = '';
    const d = {
      id: track_id,
      lv: -1,
      tv: -1,
      csrf_token: csrf,
    };
    const data = this.weapi(d);
    return {
      /**
       * 登记或执行旧式成功入口，执行 axios.post().then().catch；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调为空操作。
       * @returns {void} 无返回值。
       */
      success: (
        fn,
        /**
         * 调用方未提供可选回调时使用的空处理器，不改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        failure = () => {}
      ) => {
        axios
          .post(target_url, new URLSearchParams(data))
          .then(
            /**
             * 上一步异步操作完成后，更新 lrc、tlrc，调用 fn，依次传入 包含 lyric、tlyric 的对象。
             * @param response 异步请求返回的响应对象。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data: res_data } = response;
              let lrc = '';
              let tlrc = '';
              if (res_data.lrc != null) {
                lrc = res_data.lrc.lyric;
              }
              if (res_data.tlyric != null && res_data.tlyric.lyric != null) {
                // eslint-disable-next-line no-control-regex
                tlrc = res_data.tlyric.lyric.replace(/(|\\)/g, '');
                tlrc = tlrc.replace(/[\u2005]+/g, ' ');
              }
              return fn({
                lyric: lrc,
                tlyric: tlrc,
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 识别网易云音乐分享链接并转换为内部列表 ID；通过 success 回调交出匹配结果，无匹配时为 undefined。
   * @param url 携带 id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static parse_url(url) {
    let result;
    let id;
    // eslint-disable-next-line no-param-reassign
    url = url.replace(
      'music.163.com/#/discover/toplist?',
      'music.163.com/#/playlist?'
    );
    url = url.replace('music.163.com/#/my/m/music/', 'music.163.com/'); // eslint-disable-line no-param-reassign
    url = url.replace('music.163.com/#/m/', 'music.163.com/'); // eslint-disable-line no-param-reassign
    url = url.replace('music.163.com/#/', 'music.163.com/'); // eslint-disable-line no-param-reassign
    if (url.search('//music.163.com/playlist') !== -1) {
      const match = /\/\/music.163.com\/playlist\/([0-9]+)/.exec(url);
      id = match ? match[1] : getParameterByName('id', url);
      result = {
        type: 'playlist',
        id: `neplaylist_${id}`,
      };
    } else if (url.search('//music.163.com/artist') !== -1) {
      result = {
        type: 'playlist',
        id: `neartist_${getParameterByName('id', url)}`,
      };
    } else if (url.search('//music.163.com/album') !== -1) {
      const match = /\/\/music.163.com\/album\/([0-9]+)/.exec(url);
      id = match ? match[1] : getParameterByName('id', url);
      result = {
        type: 'playlist',
        id: `nealbum_${id}`,
      };
    }
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 整理后的结果 result；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success: (fn) => {
        fn(result);
      },
    };
  }

  /**
   * 按列表 ID 前缀路由网易云音乐的歌单、专辑或歌手详情；不支持的前缀返回 null。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {*} this.ne_get_playlist 的调用结果；其他分支返回 this.ne_album 的调用结果；其他分支返回 this.ne_artist 的调用结果；其他分支返回 null。
   */
  static get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_')[0];
    switch (list_id) {
      case 'neplaylist':
        return this.ne_get_playlist(url);
      case 'nealbum':
        return this.ne_album(url);
      case 'neartist':
        return this.ne_artist(url);
      default:
        return null;
    }
  }

  /**
   * 提供网易云音乐的推荐分类与全部分类，通过 success 回调交出筛选结构。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_playlist_filters() {
    const recommend = [
      { id: '', name: '全部' },
      { id: 'toplist', name: '排行榜' },
      { id: '流行', name: '流行' },
      { id: '民谣', name: '民谣' },
      { id: '电子', name: '电子' },
      { id: '舞曲', name: '舞曲' },
      { id: '说唱', name: '说唱' },
      { id: '轻音乐', name: '轻音乐' },
      { id: '爵士', name: '爵士' },
      { id: '乡村', name: '乡村' },
    ];

    const all = [
      {
        category: '语种',
        filters: [
          { id: '华语', name: '华语' },
          { id: '欧美', name: '欧美' },
          { id: '日语', name: '日语' },
          { id: '韩语', name: '韩语' },
          { id: '粤语', name: '粤语' },
        ],
      },
      {
        category: '风格',
        filters: [
          { id: '流行', name: '流行' },
          { id: '民谣', name: '民谣' },
          { id: '电子', name: '电子' },
          { id: '舞曲', name: '舞曲' },
          { id: '说唱', name: '说唱' },
          { id: '轻音乐', name: '轻音乐' },
          { id: '爵士', name: '爵士' },
          { id: '乡村', name: '乡村' },
          { id: 'R%26B%2FSoul', name: 'R&B/Soul' },
          { id: '古典', name: '古典' },
          { id: '民族', name: '民族' },
          { id: '英伦', name: '英伦' },
          { id: '金属', name: '金属' },
          { id: '朋克', name: '朋克' },
          { id: '蓝调', name: '蓝调' },
          { id: '雷鬼', name: '雷鬼' },
          { id: '世界音乐', name: '世界音乐' },
          { id: '拉丁', name: '拉丁' },
          { id: 'New Age', name: 'New Age' },
          { id: '古风', name: '古风' },
          { id: '后摇', name: '后摇' },
          { id: 'Bossa Nova', name: 'Bossa Nova' },
        ],
      },
      {
        category: '场景',
        filters: [
          { id: '清晨', name: '清晨' },
          { id: '夜晚', name: '夜晚' },
          { id: '学习', name: '学习' },
          { id: '工作', name: '工作' },
          { id: '午休', name: '午休' },
          { id: '下午茶', name: '下午茶' },
          { id: '地铁', name: '地铁' },
          { id: '驾车', name: '驾车' },
          { id: '运动', name: '运动' },
          { id: '旅行', name: '旅行' },
          { id: '散步', name: '散步' },
          { id: '酒吧', name: '酒吧' },
        ],
      },
      {
        category: '情感',
        filters: [
          { id: '怀旧', name: '怀旧' },
          { id: '清新', name: '清新' },
          { id: '浪漫', name: '浪漫' },
          { id: '伤感', name: '伤感' },
          { id: '治愈', name: '治愈' },
          { id: '放松', name: '放松' },
          { id: '孤独', name: '孤独' },
          { id: '感动', name: '感动' },
          { id: '兴奋', name: '兴奋' },
          { id: '快乐', name: '快乐' },
          { id: '安静', name: '安静' },
          { id: '思念', name: '思念' },
        ],
      },
      {
        category: '主题',
        filters: [
          { id: '综艺', name: '综艺' },
          { id: '影视原声', name: '影视原声' },
          { id: 'ACG', name: 'ACG' },
          { id: '儿童', name: '儿童' },
          { id: '校园', name: '校园' },
          { id: '游戏', name: '游戏' },
          { id: '70后', name: '70后' },
          { id: '80后', name: '80后' },
          { id: '90后', name: '90后' },
          { id: '网络歌曲', name: '网络歌曲' },
          { id: 'KTV', name: 'KTV' },
          { id: '经典', name: '经典' },
          { id: '翻唱', name: '翻唱' },
          { id: '吉他', name: '吉他' },
          { id: '钢琴', name: '钢琴' },
          { id: '器乐', name: '器乐' },
          { id: '榜单', name: '榜单' },
          { id: '00后', name: '00后' },
        ],
      },
    ];
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 recommend、all 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn({ recommend, all }),
    };
  }

  /**
   * 根据手机或邮箱参数构造加密登录请求，密码先作 MD5，再通过旧回调返回用户状态。
   * @param url 携带 type、password、email、countrycode、phone 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static login(url) {
    // 请求头由所在桌面或扩展环境的适配层处理。
    let target_url = 'https://music.163.com/weapi/login';
    const loginType = getParameterByName('type', url);

    const password = getParameterByName('password', url);

    let req_data = {};
    if (loginType === 'email') {
      const email = getParameterByName('email', url);

      req_data = {
        username: email,
        password: forge.md5
          .create()
          .update(forge.util.encodeUtf8(password))
          .digest()
          .toHex(),
        rememberLogin: 'true',
      };
    } else if (loginType === 'phone') {
      target_url = `https://music.163.com/weapi/login/cellphone`;
      const countrycode = getParameterByName('countrycode', url);
      const phone = getParameterByName('phone', url);
      req_data = {
        phone,
        countrycode,
        password: forge.md5
          .create()
          .update(forge.util.encodeUtf8(password))
          .digest()
          .toHex(),
        rememberLogin: 'true',
      };
    }

    const encrypt_req_data = this.weapi(req_data);
    const expire =
      (new Date().getTime() + 1e3 * 60 * 60 * 24 * 365 * 100) / 1000;

    cookieSet(
      {
        url: 'https://music.163.com',
        name: 'os',
        value: 'pc',
        expirationDate: expire,
      },
      /**
       * 保留的空回调，此处无需继续处理或改变状态。
       * @param cookie 待写入或删除的 Cookie 参数；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      (cookie) => {}
    );
    return {
      /**
       * 登记或执行旧式成功入口，执行 axios.post().then().catch；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success: (fn) => {
        axios
          .post(target_url, new URLSearchParams(encrypt_req_data))
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 status、data 的对象。
             * @param response 异步请求返回的响应对象。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response;
              const result = {
                is_login: true,
                user_id: data.account.id,
                user_name: data.account.userName,
                nickname: data.profile.nickname,
                avatar: data.profile.avatarUrl,
                platform: 'netease',
                data,
              };
              return fn({
                status: 'success',
                data: result,
              });
            }
          )
          .catch(
            /**
             * 异步操作失败后，调用 fn，依次传入 包含 status、data 的对象。
             * 无参数。
             * @returns {*} fn 回调的直接返回值。
             */
            () =>
              fn({
                status: 'fail',
                data: {},
              })
          );
      },
    };
  }

  /**
   * 分页查询用户歌单，按 subscribed 标记区分创建和收藏。
   * @param url 携带 user_id 查询参数的内部请求地址。
   * @param playlistType 自建或收藏歌单分类。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_user_playlist(url, playlistType) {
    const user_id = getParameterByName('user_id', url);
    const target_url = 'https://music.163.com/api/user/playlist';

    const req_data = {
      uid: user_id,
      limit: 1000,
      offset: 0,
      includeVideo: true,
    };

    return {
      /**
       * 登记或执行旧式成功入口，执行 axios.post().then().catch；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调为空操作。
       * @returns {void} 无返回值。
       */
      success: (
        fn,
        /**
         * 调用方未提供可选回调时使用的空处理器，不改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        failure = () => {}
      ) => {
        axios
          .post(target_url, new URLSearchParams(req_data))
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 status、data 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const playlists = [];
              response.data.playlist.forEach(
                /**
                 * 逐项处理 response.data.playlist 中的条目，执行 playlists.push。
                 * @param item 来自 response.data.playlist 的当前条目；使用 subscribed、coverImgUrl、id、name 字段。
                 * @returns {void} 无返回值。
                 */
                (item) => {
                  if (playlistType === 'created' && item.subscribed !== false) {
                    return;
                  }
                  if (playlistType === 'favorite' && item.subscribed !== true) {
                    return;
                  }
                  const playlist = {
                    cover_img_url: item.coverImgUrl,
                    id: `neplaylist_${item.id}`,
                    source_url: `https://music.163.com/#/playlist?id=${item.id}`,
                    title: item.name,
                  };
                  playlists.push(playlist);
                }
              );
              return fn({
                status: 'success',
                data: {
                  playlists,
                },
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 取得网易云音乐用户创建的歌单。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @returns {*} this.get_user_playlist 的调用结果。
   */
  static get_user_created_playlist(url) {
    return this.get_user_playlist(url, 'created');
  }

  /**
   * 取得网易云音乐用户收藏的歌单。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @returns {*} this.get_user_playlist 的调用结果。
   */
  static get_user_favorite_playlist(url) {
    return this.get_user_playlist(url, 'favorite');
  }

  /**
   * 取得网易云音乐推荐给当前会话的歌单。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_recommend_playlist() {
    const target_url = 'https://music.163.com/weapi/personalized/playlist';

    const req_data = {
      limit: 30,
      total: true,
      n: 1000,
    };

    const encrypt_req_data = this.weapi(req_data);

    return {
      /**
       * 登记或执行旧式成功入口，执行 axios.post().then().catch；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调为空操作。
       * @returns {void} 无返回值。
       */
      success: (
        fn,
        /**
         * 调用方未提供可选回调时使用的空处理器，不改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        failure = () => {}
      ) => {
        axios
          .post(target_url, new URLSearchParams(encrypt_req_data))
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 status、data 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const playlists = [];
              response.data.result.forEach(
                /**
                 * 逐项处理 response.data.result 中的条目，执行 playlists.push。
                 * @param item 来自 response.data.result 的当前条目；使用 picUrl、id、name 字段。
                 * @returns {void} 无返回值。
                 */
                (item) => {
                  const playlist = {
                    cover_img_url: item.picUrl,
                    id: `neplaylist_${item.id}`,
                    source_url: `https://music.163.com/#/playlist?id=${item.id}`,
                    title: item.name,
                  };
                  playlists.push(playlist);
                }
              );
              return fn({
                status: 'success',
                data: {
                  playlists,
                },
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 读取网易云音乐当前登录用户，按统一 status 和 data 结构回传结果。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_user() {
    const url = `https://music.163.com/api/nuser/account/get`;

    const encrypt_req_data = this.weapi({});
    return {
      /**
       * 登记或执行旧式成功入口，执行 axios.post().then().catch；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调为空操作。
       * @returns {void} 无返回值。
       */
      success: (
        fn,
        /**
         * 调用方未提供可选回调时使用的空处理器，不改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        failure = () => {}
      ) => {
        axios
          .post(url, new URLSearchParams(encrypt_req_data))
          .then(
            /**
             * 上一步异步操作完成后，更新 status、result，调用 fn，依次传入 包含 status、data 的对象。
             * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (res) => {
              let result = { is_login: false };
              let status = 'fail';
              if (res.data.account !== null) {
                status = 'success';
                const { data } = res;
                result = {
                  is_login: true,
                  user_id: data.account.id,
                  user_name: data.account.userName,
                  nickname: data.profile.nickname,
                  avatar: data.profile.avatarUrl,
                  platform: 'netease',
                  data,
                };
              }

              return fn({
                status,
                data: result,
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 返回网易云音乐登录入口地址。
   * 无参数。
   * @returns {string} 按当前字段拼接的字符串。
   */
  static get_login_url() {
    return `https://music.163.com/#/login`;
  }

  /**
   * 清除网易云音乐使用的认证 Cookie。
   * 无参数。
   * @returns {void} 无返回值。
   */
  static logout() {
    cookieRemove(
      {
        url: 'https://music.163.com',
        name: 'MUSIC_U',
      },
      /**
       * 保留的空回调，此处无需继续处理或改变状态。
       * @param cookie 待写入或删除的 Cookie 参数；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      (cookie) => {}
    );
  }
}
