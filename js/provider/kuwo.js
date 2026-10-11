/**
 * 文件职责：适配酷我搜索、歌单、专辑、歌手和歌词接口，集中处理会话令牌、Secret 请求头与重试。
 *
 * 文件级定义：
 * - h：沿用酷我网页的字符混合算法生成 Secret 头值。
 * - kuwo：提供 kuwo 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 * - kuwo.forgeMD5：先计算 SHA-1，再对摘要计算 MD5，保持站点当前要求的组合算法。
 * - kuwo.html_decode：替换接口文本中已知的 HTML 实体。
 * - kuwo.fix_json：替换接口旧文本中的单引号，以兼容后续 JSON 解析。
 * - kuwo.num2str：将数值格式化为至少两位的字符串。
 * - kuwo.kw_convert_song2：将酷我移动接口歌曲转换为统一曲目结构。
 * - kuwo.kw_convert_song3：将酷我网页接口歌曲转换为统一曲目结构。
 * - kuwo.kw_get_token：读取会话 Cookie 令牌，缺失时访问站点刷新后重试一次。
 * - kuwo.kw_cookie_get：使用会话令牌生成 Secret 头请求地址。
 * - kuwo.kw_render_tracks：根据列表类型查询第 page 页的 100 首歌曲并转换为统一数组。
 * - kuwo.search：歌曲使用每页 20 项且页码转换为零起点，歌单使用每页 30 项。
 * - kuwo.bootstrap_track：把酷我曲目解析为临时播放地址，通过 success 传出地址及来源信息。
 * - kuwo.kw_get_lrc：将秒数时间与歌词文字格式化为 LRC 行。
 * - kuwo.kw_generate_translation：把当前返回的全部歌词行写入原文，译文保持为空，以避免未区分的双语时间戳错配。
 * - kuwo.lyric：读取酷我原文和可用的译文歌词，沿用 lyric／tlyric 响应字段。
 * - kuwo.kw_artist：读取酷我歌手资料与接口提供的歌曲列表，转换为统一列表详情。
 * - kuwo.kw_album：读取酷我专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
 * - kuwo.show_playlist：按偏移和分类读取酷我歌单列表，返回供调用方登记完成回调的对象。
 * - kuwo.kw_get_playlist：读取酷我歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
 * - kuwo.parse_url：识别酷我分享链接并转换为内部列表 ID。
 * - kuwo.get_playlist：按列表 ID 前缀路由酷我的歌单、专辑或歌手详情。
 * - kuwo.get_playlist_filters：当前没有提供筛选分类，通过回调返回空的 recommend 和 all 数组。
 * - kuwo.get_user：当前没有实现用户资料查询，通过旧回调返回失败状态和空数据。
 * - kuwo.get_login_url：返回酷我登录入口地址。
 * - kuwo.logout：保留退出入口。
 */
/* eslint-disable no-unused-vars */
/* global RequestTask */
/* global async getParameterByName isElectron */

// 酷我网页接口使用会话相关的 Secret 请求头。
// 将沿用的网页字符混合算法集中放在此处，
// 避免请求流程中散布混淆运算。
/**
 * 沿用酷我网页的字符混合算法生成 Secret 头值；输入不符合算法要求时按原逻辑返回空值。
 * @param t 待混合编码的明文字符串；使用 charCodeAt 字段。
 * @param e 用于推导混合参数的密码字符串；使用 charCodeAt 字段。
 * @returns {string|null} 按网页算法混合得到的十六进制文本，末尾带随机盐；密码为空或无法生成合适的哈希参数时记录错误并返回 null。
 */
function h(t, e) {
  // 此函数沿用酷我网页算法，局部关闭 ESLint 检查。
  /* eslint-disable */
  if (null == e || e.length <= 0)
    return (
      console.log('Please enter a password with which to encrypt the message.'),
      null
    );
  for (var n = '', i = 0; i < e.length; i++) n += e.charCodeAt(i).toString();
  var r = Math.floor(n.length / 5),
    o = parseInt(
      n.charAt(r) +
        n.charAt(2 * r) +
        n.charAt(3 * r) +
        n.charAt(4 * r) +
        n.charAt(5 * r)
    ),
    l = Math.ceil(e.length / 2),
    c = Math.pow(2, 31) - 1;
  if (o < 2)
    return (
      console.log(
        'Algorithm cannot find a suitable hash. Please choose a different password. \nPossible considerations are to choose a more complex or longer password.'
      ),
      null
    );
  var d = Math.round(1e9 * Math.random()) % 1e8;
  for (n += d; n.length > 10;)
    n = (
      parseInt(n.substring(0, 10)) + parseInt(n.substring(10, n.length))
    ).toString();
  n = (o * n + l) % c;
  var h = '',
    f = '';
  for (i = 0; i < t.length; i++)
    ((f +=
      (h = parseInt(t.charCodeAt(i) ^ Math.floor((n / c) * 255))) < 16
        ? '0' + h.toString(16)
        : h.toString(16)),
      (n = (o * n + l) % c));
  for (d = d.toString(16); d.length < 8;) d = '0' + d;
  return (f += d);
}

/**
 * 提供 kuwo 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 */
class kuwo {
  /**
   * 先计算 SHA-1，再对摘要计算 MD5，保持站点当前要求的组合算法。
   * @param message 待转发的消息或文本。
   * @returns {string} 先 SHA-1 后 MD5 得到的十六进制文本。
   */
  static forgeMD5(message) {
    const md = forge.md.sha1.create();
    md.update(message);
    const sig1 = md.digest().toHex();
    const sig2 = forge.md5
      .create()
      .update(forge.util.encodeUtf8(sig1))
      .digest()
      .toHex();
    return sig2;
  }

  // 解码 HTML 实体。
  /**
   * 替换接口文本中已知的 HTML 实体。
   * @param str 待转换的字符串。
   * @returns {*} text。
   */
  static html_decode(str) {
    let text = str;
    const entities = [
      ['amp', '&'],
      ['apos', "'"],
      ['#x27', "'"],
      ['#x2F', '/'],
      ['#39', "'"],
      ['#47', '/'],
      ['lt', '<'],
      ['gt', '>'],
      ['nbsp', ' '],
      ['quot', '"'],
    ];

    for (let i = 0, max = entities.length; i < max; i += 1) {
      text = text.replace(
        new RegExp(`&${entities[i][0]};`, 'g'),
        entities[i][1]
      );
    }

    return text;
  }

  // 兼容旧响应中的单引号。
  /**
   * 替换接口旧文本中的单引号，以兼容后续 JSON 解析。
   * @param data 本次处理或转发的业务数据。
   * @returns {string} data.replace 的调用结果。
   */
  static fix_json(data) {
    return data.replace(/(')/g, '"');
  }

  /**
   * 将数值格式化为至少两位的字符串。
   * @param num 待格式化的数值。
   * @returns {*} parseInt().toString 的调用结果 加上 num % 10.toString 的调用结果。
   */
  static num2str(num) {
    // 停用代码，保留供历史对照：
    // const t = parseInt(num, 10);
    return parseInt(num / 10, 10).toString() + (num % 10).toString();
  }

  /* 停用代码，保留供历史对照：
static kw_convert_song(item) {
    const song_id = item.MUSICRID.split('_').pop();
    const track = {
      id: `kwtrack_${song_id}`,
      title: html_decode(item.SONGNAME),
      artist: html_decode(item.ARTIST),
      artist_id: `kwartist_${item.ARTISTID}`,
      album: html_decode(item.ALBUM),
      album_id: `kwalbum_${item.ALBUMID}`,
      source: 'kuwo',
      source_url: `https://www.kuwo.cn/play_detail/${song_id}`,
      img_url: '',
      // url: `kwtrack_${song_id}`,
      lyric_url: song_id,
    };
    return track;
  } */
  /**
   * 将酷我移动接口歌曲转换为统一曲目结构。
   * @param item 当前遍历或处理的条目；使用 rid、name、artist、artistid、album、albumid、pic 字段。
   * @returns {Object} 包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、lyric_url 的对象。
   */
  static kw_convert_song2(item) {
    return {
      id: `kwtrack_${item.rid}`,
      title: this.html_decode(item.name),
      artist: this.html_decode(item.artist),
      artist_id: `kwartist_${item.artistid}`,
      album: this.html_decode(item.album),
      album_id: `kwalbum_${item.albumid}`,
      source: 'kuwo',
      source_url: `https://www.kuwo.cn/play_detail/${item.rid}`,
      img_url: item.pic,
      // 停用代码，保留供历史对照：
      // url: `kwtrack_${musicrid}`,
      lyric_url: item.rid,
    };
  }
  /**
   * 将酷我网页接口歌曲转换为统一曲目结构。
   * @param item 当前遍历或处理的条目；使用 DC_TARGETID、NAME、ARTIST、ARTISTID、ALBUM、ALBUMID、web_albumpic_short 字段。
   * @returns {Object} 包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、lyric_url 的对象。
   */
  static kw_convert_song3(item) {
    return {
      id: `kwtrack_${item.DC_TARGETID}`,
      title: this.html_decode(item.NAME),
      artist: this.html_decode(item.ARTIST),
      artist_id: `kwartist_${item.ARTISTID}`,
      album: this.html_decode(item.ALBUM),
      album_id: `kwalbum_${item.ALBUMID}`,
      source: 'kuwo',
      source_url: `https://www.kuwo.cn/play_detail/${item.DC_TARGETID}`,
      img_url: `https://img2.kuwo.cn/star/albumcover/${item.web_albumpic_short}`,
      // 停用代码，保留供历史对照：
      // url: `kwtrack_${musicrid}`,
      lyric_url: item.DC_TARGETID,
    };
  }

  /* 停用代码，保留供历史对照：
function async_process_list(data_list, handler, handler_extra_param_list, callback) {
    const fnDict = {};
    data_list.forEach((item, index) => {
      fnDict[index] = (cb) => handler(index, item, handler_extra_param_list, cb);
    });
    async.parallel(fnDict, (err, results) => {
      callback(null, data_list.map((item, index) => results[index]));
    });
  }

  function kw_add_song_pic_in_track(track, params, callback) {
    // 补充歌曲封面
    const target_url = 'https://artistpicserver.kuwo.cn/pic.web?'
      + `type=rid_pic&pictype=url&size=240&rid=${track.lyric_url}`;
    axios.get(target_url)
      .then((response) => {
        const { data } = response;
        track.img_url = data; // eslint-disable-line no-param-reassign
        callback(null, track);
      });
  }

  function kw_render_search_result_item(index, item, params, callback) {
    const track = kw_convert_song(item);
    kw_add_song_pic_in_track(track, params, callback);
  }

  function kw_render_artist_result_item(index, item, params, callback) {
    const track = {
      id: `kwtrack_${item.musicrid}`,
      title: html_decode(item.name),
      artist: item.artist,
      artist_id: `kwartist_${item.artistid}`,
      album: html_decode(item.album),
      album_id: `kwalbum_${item.albumid}`,
      source: 'kuwo',
      source_url: `https://www.kuwo.cn/play_detail/${item.musicrid}`,
      img_url: '',
      //url: `kwtrack_${item.musicrid}`,
      lyric_url: item.musicrid,
    };

    kw_add_song_pic_in_track(track, params, callback);
  }

  function kw_render_album_result_item(index, item, params, callback) {
    const info = params[0];

    const track = {
      id: `kwtrack_${item.id}`,
      title: html_decode(item.name),
      artist: item.artist,
      artist_id: `kwartist_${item.artistid}`,
      album: info.title,
      album_id: `kwalbum_${info.id}`,
      source: 'kuwo',
      source_url: `https://www.kuwo.cn/play_detail/${item.id}`,
      img_url: '',
      //url: `kwtrack_${item.id}`,
      lyric_url: item.id,
    };

    kw_add_song_pic_in_track(track, params, callback);
  }

  function kw_render_playlist_result_item(index, item, params, callback) {
    const track = {
      id: `kwtrack_${item.id}`,
      title: html_decode(item.name),
      artist: item.artist,
      artist_id: `kwartist_${item.artistid}`,
      album: html_decode(item.album),
      album_id: `kwalbum_${item.albumid}`,
      source: 'kuwo',
      source_url: `https://www.kuwo.cn/play_detail/${item.id}`,
      img_url: '',
      //url: `kwtrack_${item.id}`,
      lyric_url: item.id,
    };

    kw_add_song_pic_in_track(track, params, callback);
  } */
  /**
   * 读取会话 Cookie 令牌，缺失时访问站点刷新后重试一次；失败交给可选失败回调。
   * @param callback 完成当前操作后调用的回调。
   * @param isRetry 是否已执行过令牌刷新重试。
   * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调为空操作。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {void} 无返回值。
   */
  static kw_get_token(
    callback,
    isRetry,
    /**
     * 调用方未提供可选回调时使用的空处理器，不改变状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    failure = () => {},
    options = {}
  ) {
    let isRetryValue = true;
    if (isRetry === undefined) {
      isRetryValue = false;
    } else {
      isRetryValue = isRetry;
    }
    const domain = 'https://www.kuwo.cn';
    const name = 'Hm_Iuvt_cdb524f42f23cer9b268564v7y735ewrq2324';

    cookieGet(
      {
        url: domain,
        name,
      },
      /**
       * 进入此回调后，调用 callback，依次传入 ""。
       * @param cookie 待写入或删除的 Cookie 参数；使用 value 字段。
       * @returns {*} callback 回调的直接返回值；其他分支返回 该异步链的 Promise。
       */
      (cookie) => {
        if (cookie == null) {
          if (isRetryValue) {
            return callback('');
          }
          return RequestTask.http(options)
            .get('https://www.kuwo.cn/')
            .then(
              /**
               * 上一步异步操作完成后，执行 this.kw_get_token。
               * 无参数。
               * @returns {void} 无返回值。
               */
              () => {
                this.kw_get_token(callback, true, failure, options);
              }
            )
            .catch(failure);
        }
        return callback(cookie.value);
      }
    );
  }

  /**
   * 使用会话令牌生成 Secret 头请求地址；令牌失效时刷新并重试，沿用调用方取消信号。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @param callback 完成当前操作后调用的回调。
   * @param [failure] 接收失败原因的回调；省略时沿用声明中的默认处理；默认回调执行 callback 回调的直接返回值。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {void} 无返回值。
   */
  static kw_cookie_get(
    url,
    callback,
    /**
     * 调用方未提供可选回调时，调用 callback 完成通知。
     * 无参数。
     * @returns {*} callback 回调的直接返回值。
     */
    failure = () => callback(),
    options = {}
  ) {
    const name = 'Hm_Iuvt_cdb524f42f23cer9b268564v7y735ewrq2324';
    const request = RequestTask.http(options);
    this.kw_get_token(
      /**
       * 进入此回调后，执行 request.get().then().catch。
       * @param token 酷我当前会话 Cookie 令牌。
       * @returns {void} 无返回值。
       */
      (token) => {
        // 需要令牌的酷我请求统一经过此处，
        // 集中处理令牌刷新和重试。
        request
          .get(url, {
            headers: {
              Secret: h(token, name),
            },
          })
          .then(
            /**
             * 上一步异步操作完成后，调用 callback，依次传入 response。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {void} 无返回值。
             */
            (response) => {
              if (
                response.data.success === false &&
                /token|csrf|验证/i.test(
                  response.data.message || response.data.msg || ''
                )
              ) {
                // 令牌失效时重新获取，再重试地址请求。
                this.kw_get_token(
                  /**
                   * 进入此回调后，执行 request.get().then().catch。
                   * @param token2 重新获取的酷我会话令牌。
                   * @returns {void} 无返回值。
                   */
                  (token2) => {
                    request
                      .get(url, {
                        headers: {
                          Secret: h(token2, name),
                        },
                      })
                      .then(
                        /**
                         * 上一步异步操作完成后，调用 callback，依次传入 res。
                         * @param res 异步响应或消息应答函数，按调用位置使用。
                         * @returns {void} 无返回值。
                         */
                        (res) => {
                          callback(res);
                        }
                      )
                      .catch(failure);
                  },
                  false,
                  failure,
                  options
                );
              } else {
                callback(response);
              }
            }
          )
          .catch(failure);
      },
      false,
      failure,
      options
    );
  }

  /**
   * 根据列表类型查询第 page 页的 100 首歌曲并转换为统一数组。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @param page 页面对象或从 1 开始的来源页码，按当前调用位置使用。
   * @param callback 完成当前操作后调用的回调。
   * @returns {void} 无返回值。
   */
  static kw_render_tracks(url, page, callback) {
    const list_id = getParameterByName('list_id', url).split('_').pop();
    const playlist_type = getParameterByName('list_id', url).split('_')[0];
    let tracks_url = '';
    switch (playlist_type) {
      case 'kwplaylist':
        // 停用代码，保留供历史对照：
        // tracks_url = `https://m.kuwo.cn/newh5app/api/mobile/v1/music/playlist/${list_id}?pn=${page}&rn=1000`
        tracks_url = `https://www.kuwo.cn/api/www/playlist/playListInfo?pid=${list_id}&pn=${page}&rn=100&httpsStatus=1`;
        break;
      case 'kwalbum':
        // 停用代码，保留供历史对照：
        // tracks_url = `https://m.kuwo.cn/newh5app/api/mobile/v1/music/album/${list_id}?rn=1000`
        tracks_url = `https://www.kuwo.cn/api/www/album/albumInfo?albumId=${list_id}&pn=${page}&rn=100&httpsStatus=1`;
        break;
      default:
        break;
    }
    // 停用代码，保留供历史对照：
    // axios.get(tracks_url).then((response) => {
    this.kw_cookie_get(
      tracks_url,
      /**
       * 进入此回调后，调用 callback，依次传入 null、曲目数组 tracks。
       * @param response 异步请求返回的响应对象；使用 data 字段。
       * @returns {*} callback 回调的直接返回值。
       */
      (response) => {
        const tracks = response.data.data.musicList.map(
          /**
           * 转换 response.data.data.musicList 中的条目，this.kw_convert_song2 的调用结果。
           * @param item 来自 response.data.data.musicList 的当前条目。
           * @returns {*} this.kw_convert_song2 的调用结果。
           */
          (item) => this.kw_convert_song2(item)
        );
        return callback(null, tracks);
      }
    );
  }

  /**
   * 歌曲使用每页 20 项且页码转换为零起点，歌单使用每页 30 项；转换统一搜索响应。
   * @param url 携带 keywords、curpage、type 查询参数的内部请求地址。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static search(url, options = {}) {
    const keyword = encodeURIComponent(getParameterByName('keywords', url));
    const curpage = getParameterByName('curpage', url);
    const pn = parseInt(curpage) - 1;
    const searchType = getParameterByName('type', url);
    let api = '';
    let target_url = '';
    switch (searchType) {
      case '0':
        api = 'searchMusicBykeyWord';
        target_url = `https://www.kuwo.cn/search/${api}?vipver=1&client=kt&ft=music&cluster=0&strategy=2012&encoding=utf8&rformat=json&mobi=1&issubtitle=1&show_copyright_off=1&pn=${pn}&rn=20&all=${keyword}`;
        break;
      case '1':
        api = 'searchPlayListBykeyWord';
        target_url = `https://www.kuwo.cn/api/www/search/${api}?key=${keyword}&pn=${curpage}&rn=30`;
        break;
      default:
        break;
    }

    return {
      /**
       * 登记或执行旧式成功入口，执行 this.kw_cookie_get；业务结果通过 fn 传出。
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
        this.kw_cookie_get(
          target_url,
          /**
           * 进入此回调后，更新 result、total，调用 fn，依次传入 包含 result、total、type 的对象。
           * @param response 异步请求返回的响应对象；使用 data 字段。
           * @returns {*} fn 回调的直接返回值。
           */
          (response) => {
            let result = [];
            let total = 0;
            if (response === undefined) {
              return fn({
                result,
                total,
                type: searchType,
              });
            }
            if (searchType === '0' && response.data.abslist !== undefined) {
              result = response.data.abslist.map(
                /**
                 * 转换 response.data.abslist 中的条目，this.kw_convert_song3 的调用结果。
                 * @param item 来自 response.data.abslist 的当前条目。
                 * @returns {*} this.kw_convert_song3 的调用结果。
                 */
                (item) => this.kw_convert_song3(item)
              );
              total = parseInt(response.data.HIT);
            } else if (searchType === '1' && response.data.data !== undefined) {
              result = response.data.data.list.map(
                /**
                 * 转换 response.data.data.list 中的条目，包含 id、title、source、source_url、img_url、url、author、count 的对象。
                 * @param item 来自 response.data.data.list 的当前条目；使用 id、name、img、uname、total 字段。
                 * @returns {Object} 包含 id、title、source、source_url、img_url、url、author、count 的对象。
                 */
                (item) => ({
                  id: `kwplaylist_${item.id}`,
                  title: this.html_decode(item.name),
                  source: 'kuwo',
                  source_url: `https://www.kuwo.cn/playlist_detail/${item.id}`,
                  img_url: item.img,
                  url: `kwplaylist_${item.id}`,
                  author: this.html_decode(item.uname),
                  count: item.total,
                })
              );
              total = response.data.data.total;
            }
            return fn({
              result,
              total,
              type: searchType,
            });
          },
          failure,
          options
        );
      },
    };
  }

  /**
   * 把酷我曲目解析为临时播放地址，通过 success 传出地址及来源信息；不可用或请求失败时调用 failure。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 id 字段。
   * @param success 接收成功业务结果的回调。
   * @param failure 接收失败原因的回调；省略时沿用声明中的默认处理。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {void} 无返回值。
   */
  static bootstrap_track(track, success, failure, options = {}) {
    const sound = {};
    const song_id = track.id.slice('kwtrack_'.length);

    const target_url = `https://www.kuwo.cn/api/v1/www/music/playUrl?mid=${song_id}&type=music&httpsStatus=1&reqId=&plat=web_www&from=`;
    this.kw_cookie_get(
      target_url,
      /**
       * 进入此回调后，更新 sound.url、sound.platform、code，调用 success，依次传入 播放地址对象 sound。
       * @param response 异步请求返回的响应对象；使用 data 字段。
       * @returns {void} 无返回值。
       */
      (response) => {
        const data = response?.data;

        if (data && data.data && data.data.url) {
          sound.url = data.data.url;
          sound.platform = 'kuwo';

          success(sound);
        } else {
          const message = data?.message || data?.msg || '';
          let code = 'RESOURCE_UNAVAILABLE';
          if (/付费|购买/.test(message)) code = 'PAYMENT_REQUIRED';
          else if (/登录/.test(message)) code = 'AUTH_REQUIRED';
          failure({ code, businessCode: data?.code });
        }
      },
      failure,
      options
    );
  }

  /**
   * 将秒数时间与歌词文字格式化为 LRC 行。
   * @param arr 待移动或格式化的数组；使用 reduce 字段。
   * @returns {*} lyric。
   */
  static kw_get_lrc(arr) {
    const lyric = arr.reduce(
      /**
       * 归并 arr 中的条目，执行 parseFloat。
       * @param str 上一步归并得到的累计结果。
       * @param item 来自 arr 的当前条目；使用 time、lineLyric 字段。
       * @returns {string} 按当前字段拼接的字符串。
       */
      (str, item) => {
        const t = parseFloat(item.time);
        const m = parseInt(t / 60, 10);
        const s = parseInt(t - m * 60, 10);
        const ms = parseInt((t - m * 60 - s) * 100, 10);
        return `${str}[${this.num2str(m)}:${this.num2str(
          parseInt(s, 10)
        )}.${this.num2str(ms)}]${item.lineLyric}\n`;
      },
      ''
    );
    return lyric;
  }

  /**
   * 把当前返回的全部歌词行写入原文，译文保持为空，以避免未区分的双语时间戳错配。
   * @param lrclist 带时间和内容的歌词条目数组。
   * @returns {Object} lyric 包含原始歌词行，tlyric 为空字符串。
   */
  static kw_generate_translation(lrclist) {
    if (lrclist) {
      lrclist.filter(
        /**
         * 筛选检查 lrclist 中的条目，e 且 e.lineLyric 是否不等于 "//"。
         * @param e 来自 lrclist 的当前条目；使用 lineLyric 字段。
         * @returns {*} e 且 e.lineLyric 是否不等于 "//"。
         */
        (e) => e && e.lineLyric !== '//'
      );

      // 暂时原歌词和翻译都在原歌词显示
      // 酷我的歌词格式中没区分，查看了几个歌词文件发现，翻译歌词也存在和原来歌词的时间轴不一致的情况
      // 如果按照时间区分可能造成错行问题。

      // 将歌词和翻译分成两个数组，并将对应歌词和翻译的时间调整为相等，数组最后一个数据无法做判断，故传给翻译数组做后续处理
      // 停用代码，保留供历史对照：
      // const lrc_arr = [];
      // const tlrc_arr = [];
      // let lrc_arr = lrclist.filter(
      //   (item, index, self) => {
      //     if (index < self.length - 1) {
      //       if (Number(item.time) === 0) {
      //         return item;
      //       }
      //       return item.time !== self[index + 1].time;
      //     }
      //     return null;
      //   },
      // );
      // let tlrc_arr = lrclist.filter(
      //   (item, index, self) => {
      //     if (index < self.length - 1 && Number(item.time) !== 0
      //       && item.time === self[index + 1].time) {
      //       return item.time === self[index - 1].time;
      //     }
      //     return (index === self.length - 1 ? item : null);
      //   },
      // );
      // // tlrc_arr如只有一个即为没有翻译歌词
      // if (tlrc_arr.length === 1) {
      //   lrc_arr = [...lrc_arr, ...tlrc_arr];
      //   tlrc_arr = [];
      // } else {
      //   tlrc_arr[tlrc_arr.length - 1].time = lrc_arr[lrc_arr.length - 1].time;
      // }
      return {
        lrc: kuwo.kw_get_lrc(lrclist),
        tlrc: kuwo.kw_get_lrc([]),
      };
    }
    return {
      lrc: '',
      tlrc: '',
    };
  }

  /**
   * 读取酷我原文和可用的译文歌词，沿用 lyric／tlyric 响应字段。
   * @param url 携带 lyric_url 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lyric(url) {
    const track_id = getParameterByName('lyric_url', url);
    const target_url = `https://m.kuwo.cn/newh5/singles/songinfoandlrc?musicId=${track_id}`;

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
             * 上一步异步操作完成后，更新 data，调用 fn，依次传入 包含 lyric、tlyric 的对象。
             * @param response 异步请求返回的响应对象。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              let { data } = response;
              data =
                data.status === 200
                  ? this.kw_generate_translation(data.data.lrclist)
                  : {};
              return fn({
                lyric: data.lrc || '',
                tlyric: data.tlrc || '',
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 读取酷我歌手资料与接口提供的歌曲列表，转换为统一列表详情。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static kw_artist(url) {
    const artist_id = getParameterByName('list_id', url).split('_').pop();
    return {
      /**
       * 登记或执行旧式成功入口，执行 this.kw_cookie_get；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success: (fn) => {
        let target_url = `https://www.kuwo.cn/api/www/artist/artist?artistid=${artist_id}`;
        this.kw_cookie_get(
          target_url,
          /**
           * 进入此回调后，更新 target_url，执行 this.html_decode。
           * @param response 异步请求返回的响应对象；使用 data 字段。
           * @returns {void} 无返回值。
           */
          (response) => {
            const { data } = response.data;
            // 停用代码，保留供历史对照：
            // data = JSON.parse(fix_json(data));
            const info = {
              cover_img_url: data.pic300,
              title: this.html_decode(data.name),
              id: `kwartist_${data.id}`,
              source_url: `https://www.kuwo.cn/singer_detail/${data.id}`,
            };

            // 读取歌曲列表。
            target_url = `https://www.kuwo.cn/api/www/artist/artistMusic?artistid=${artist_id}&pn=1&rn=50`;
            this.kw_cookie_get(
              target_url,
              /**
               * 进入此回调后，调用 fn，依次传入 包含 tracks、info 的对象。
               * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
               * @returns {*} fn 回调的直接返回值。
               */
              (res) => {
                const tracks = res.data.data.list.map(
                  /**
                   * 转换 res.data.data.list 中的条目，this.kw_convert_song2 的调用结果。
                   * @param item 来自 res.data.data.list 的当前条目。
                   * @returns {*} this.kw_convert_song2 的调用结果。
                   */
                  (item) => this.kw_convert_song2(item)
                );
                return fn({
                  tracks,
                  info,
                });
              }
            );
            /* 停用代码，保留供历史对照：
target_url = 'https://search.kuwo.cn/r.s?stype=artist2music'
            + '&sortby=0&alflac=1&pcmp4=1&encoding=utf8'
            + `&artistid=${artist_id}&pn=0&rn=100`;
          axios.get(target_url).then((response) => {
            let { data } = response; // TODO：核对返回的 JSON 结构
            data = JSON.parse(fix_json(data));

            async_process_list(data.musiclist, kw_render_artist_result_item, [],
              (err, tracks) => fn({
                tracks,
                info,
              })); */
          }
        );
      },
    };
  }

  /**
   * 读取酷我专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static kw_album(url) {
    const album_id = getParameterByName('list_id', url).split('_').pop();
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
        const target_url =
          'https://search.kuwo.cn/r.s?pn=0&rn=0&stype=albuminfo' +
          `&albumid=${album_id}&alflac=1&pcmp4=1&encoding=utf8` +
          '&vipver=MUSIC_8.7.7.0_W4';
        axios
          .get(target_url)
          .then(
            /**
             * 上一步异步操作完成后，更新 data，执行 this.fix_json。
             * @param response 异步请求返回的响应对象。
             * @returns {void} 无返回值。
             */
            (response) => {
              let { data } = response;
              data = JSON.parse(this.fix_json(data));

              const info = {
                cover_img_url: data.hts_img.replace('/120/', '/400/'),
                title: this.html_decode(data.name),
                id: `kwalbum_${data.albumid}`,
                source_url: `https://www.kuwo.cn/album_detail/${data.albumid}`,
              };
              // 读取歌曲列表。
              const total = data.songnum;
              const page = Math.ceil(total / 100);
              const page_array = Array.from(
                { length: page },
                /**
                 * 进入此回调后，取得 k 加上 1。
                 * @param v 数组或类数组输入中的当前值；当前函数体未使用，保留调用签名。
                 * @param k 当前条目的零起点索引。
                 * @returns {*} k 加上 1。
                 */
                (v, k) => k + 1
              );
              async.concat(
                page_array,
                /**
                 * 进入此回调后，执行 this.kw_render_tracks。
                 * @param item 当前遍历或处理的条目。
                 * @param callback 完成当前操作后调用的回调。
                 * @returns {*} this.kw_render_tracks 的调用结果。
                 */
                (item, callback) => this.kw_render_tracks(url, item, callback),
                /**
                 * 进入此回调后，调用 fn，依次传入 包含 tracks、info 的对象。
                 * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
                 * @param tracks 保持来源或调用方顺序的曲目数组。
                 * @returns {void} 无返回值。
                 */
                (err, tracks) => {
                  fn({
                    tracks,
                    info,
                  });
                }
              );
              /* 停用代码，保留供历史对照：
async_process_list(data.musiclist, kw_render_album_result_item, [info],
            (err, tracks) => fn({
              tracks,
              info,
            })); */
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 按偏移和分类读取酷我歌单列表，返回供调用方登记完成回调的对象。
   * @param url 携带 offset 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static show_playlist(url) {
    const offset = Number(getParameterByName('offset', url));

    /* 停用代码，保留供历史对照：
const id_available = {
      1265: '经典',
      577: '纯音乐',
      621: '网络',
      155: '怀旧',
      1879: '网红',
      220: '佛乐',
      180: '影视',
      578: '器乐',
      1877: '游戏',
      181: '二次元',
      882: 'KTV',
      216: '喊麦',
      1366: '3D',
      146: '伤感',
      62: '放松',
      58: '励志',
      143: '开心',
      137: '甜蜜',
      139: '兴奋',
      67: '安静',
      66: '治愈',
      147: '寂寞',
      160: '四年',
      366: '运动',
      354: '睡前',
      378: '跳舞',
      1876: '学习',
      353: '清晨',
      359: '夜店',
      382: '校园',
      544: '亲热',
      363: '咖啡店',
      375: '旅行',
      371: '散步',
      386: '工作',
      336: '婚礼',
      637: '70后',
      638: '80后',
      639: '90后',
      640: '00后',
      268: '10后',
      393: '流行',
      391: '电子',
      389: '摇滚',
      1921: '民歌',
      392: '民谣',
      399: '乡村',
      35: '欧洲',
      37: '华语',
    }; */
    // 停用代码，保留供历史对照：
    // const target_url = 'https://www.kuwo.cn/www/categoryNew/getPlayListInfoUnderCategory?'
    // + `type=taglist&digest=10000&id=${37}&start=${offset}&count=50`;
    const target_url = `https://www.kuwo.cn/api/pc/classify/playlist/getRcmPlayList?pn=${
      offset / 25 + 1
    }&rn=25&order=hot&httpsStatus=1`;
    /* 停用代码，保留供历史对照：
精选歌单:roder=最热:hot, 最新:new
    tag歌单地址 https://www.kuwo.cn/api/pc/classify/playlist/getTagPlayList?pn=${offset / 25 + 1}&rn=25&id=37&httpsStatus=1
    id =华语:37, */
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
             * 上一步异步操作完成后，调用 fn，依次传入 空数组。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response.data;
              if (!data) {
                return fn([]);
              }
              const result = data.data.map(
                /**
                 * 转换 data.data 中的条目，包含 cover_img_url、title、id、source_url 的对象。
                 * @param item 来自 data.data 的当前条目；使用 img、name、id 字段。
                 * @returns {Object} 包含 cover_img_url、title、id、source_url 的对象。
                 */
                (item) => ({
                  cover_img_url: item.img,
                  title: item.name,
                  id: `kwplaylist_${item.id}`,
                  source_url: `https://www.kuwo.cn/playlist_detail/${item.id}`,
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
   * 读取酷我歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static kw_get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_').pop();
    const target_url =
      'https://nplserver.kuwo.cn/pl.svc?' +
      'op=getlistinfo&pn=0&rn=0&encode=utf-8&keyset=pl2012&pcmp4=1' +
      `&pid=${list_id}&vipver=MUSIC_9.0.2.0_W1&newver=1`;
    // https://www.kuwo.cn/api/www/playlist/playListInfo?pid=3134372426&pn=1&rn=30
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
             * 上一步异步操作完成后，执行 data.pic.replace（"_150.jpg"）。
             * @param response 异步请求返回的响应对象。
             * @returns {void} 无返回值。
             */
            (response) => {
              const { data } = response;

              const info = {
                cover_img_url: data.pic.replace('_150.jpg', '_400.jpg'),
                title: data.title,
                id: `kwplaylist_${data.id}`,
                source_url: `https://www.kuwo.cn/playlist_detail/${data.id}`,
              };
              const { total } = data;
              const page = Math.ceil(total / 100);
              const page_array = Array.from(
                { length: page },
                /**
                 * 进入此回调后，取得 k 加上 1。
                 * @param v 数组或类数组输入中的当前值；当前函数体未使用，保留调用签名。
                 * @param k 当前条目的零起点索引。
                 * @returns {*} k 加上 1。
                 */
                (v, k) => k + 1
              );
              async.concat(
                page_array,
                /**
                 * 进入此回调后，执行 this.kw_render_tracks。
                 * @param item 当前遍历或处理的条目。
                 * @param callback 完成当前操作后调用的回调。
                 * @returns {*} this.kw_render_tracks 的调用结果。
                 */
                (item, callback) => this.kw_render_tracks(url, item, callback),
                /**
                 * 进入此回调后，调用 fn，依次传入 包含 tracks、info 的对象。
                 * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
                 * @param tracks 保持来源或调用方顺序的曲目数组。
                 * @returns {void} 无返回值。
                 */
                (err, tracks) => {
                  fn({
                    tracks,
                    info,
                  });
                }
              );
              /* 停用代码，保留供历史对照：
async_process_list(data.musiclist, kw_render_playlist_result_item, [],
            (err, tracks) => fn({
              tracks,
              info,
            })); */
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 识别酷我分享链接并转换为内部列表 ID；通过 success 回调交出匹配结果，无匹配时为 undefined。
   * @param myurl 待识别的平台分享链接。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static parse_url(myurl) {
    let result;
    let id;
    let url = myurl;
    url = url.replace(/kuwo.cn\/(h5app|newh5(?:app){0,1})\//, 'kuwo.cn/');
    url = url.replace(/kuwo.cn\/(album\/|\?albumid=)/, 'kuwo.cn/album_detail/');
    url = url.replace(/kuwo.cn\/(artist|singers)\//, 'kuwo.cn/singer_detail/');
    url = url.replace(/kuwo.cn\/playlist\//, 'kuwo.cn/playlist_detail/');
    if (url.search('kuwo.cn/playlist_detail') !== -1) {
      const match = /kuwo.cn\/playlist_detail\/([0-9]+)/.exec(url);
      id = match ? match[1] : getParameterByName('pid', url);
      result = {
        type: 'playlist',
        id: `kwplaylist_${id}`,
      };
    } else if (url.search('kuwo.cn/singer_detail') !== -1) {
      const match = /kuwo.cn\/singer_detail\/([0-9]+)/.exec(url);
      id = match ? match[1] : getParameterByName('id', url);
      result = {
        type: 'playlist',
        id: `kwartist_${id}`,
      };
    } else if (url.search('kuwo.cn/album_detail') !== -1) {
      const match = /kuwo.cn\/album_detail\/([0-9]+)/.exec(url);
      if (match) {
        id = match[1];
        result = {
          type: 'playlist',
          id: `kwalbum_${id}`,
        };
      }
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
   * 按列表 ID 前缀路由酷我的歌单、专辑或歌手详情；不支持的前缀返回 null。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {*} this.kw_get_playlist 的调用结果；其他分支返回 this.kw_album 的调用结果；其他分支返回 this.kw_artist 的调用结果；其他分支返回 null。
   */
  static get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_')[0];
    switch (list_id) {
      case 'kwplaylist':
        return this.kw_get_playlist(url);
      case 'kwalbum':
        return this.kw_album(url);
      case 'kwartist':
        return this.kw_artist(url);
      default:
        return null;
    }
  }

  /**
   * 当前没有提供筛选分类，通过回调返回空的 recommend 和 all 数组。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_playlist_filters() {
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 recommend、all 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn({ recommend: [], all: [] }),
    };
  }

  /**
   * 当前没有实现用户资料查询，通过旧回调返回失败状态和空数据。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_user() {
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 status、data 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success: (fn) => {
        fn({ status: 'fail', data: {} });
      },
    };
  }

  /**
   * 返回酷我登录入口地址。
   * 无参数。
   * @returns {string} 按当前字段拼接的字符串。
   */
  static get_login_url() {
    return `https://www.kuwo.com`;
  }

  /**
   * 保留退出入口；当前函数体为空，不修改认证状态。
   * 无参数。
   * @returns {void} 无返回值。
   */
  static logout() {}

  // 停用代码，保留供历史对照：
  // return {
  //   show_playlist: kw_show_playlist,
  //   get_playlist_filters,
  //   get_playlist,
  //   parse_url: kw_parse_url,
  //   bootstrap_track: kw_bootstrap_track,
  //   search: kw_search,
  //   lyric: kw_lyric,
  //   get_user: kw_get_user,
  //   get_login_url: kw_get_login_url,
  //   logout: kw_logout,
  // };
}
