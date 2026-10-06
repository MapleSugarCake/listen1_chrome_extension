/**
 * 文件职责：将哔哩哔哩音频和视频接口转换为统一曲目协议，处理 WBI 签名、分页和音频流地址。
 *
 * 文件级定义：
 * - wbi_key：哔哩哔哩 WBI 签名键缓存，失败重试前可清空。
 * - bilibili：提供 bilibili 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 * - bilibili.htmlDecode：通过临时 DOM 元素解码标题中的 HTML 实体。
 * - bilibili.fetch_wbi_key：请求导航接口并从图片地址提取 WBI 签名所需的两段键。
 * - bilibili.clear_wbi_key：使缓存的 WBI 键失效，供下一请求重新获取。
 * - bilibili.get_wbi_key：优先复用缓存键，缺失时异步获取并保存。
 * - bilibili.enc_wbi：加入秒级时间戳，过滤指定字符并按键排序，计算 WBI 查询签名。
 * - bilibili.wrap_wbi_request：签名并请求指定接口，失败后清除缓存键并重试一次，仍失败时沿用空结果回退。
 * - bilibili.bi_convert_song：将音频区条目转换为统一曲目。
 * - bilibili.bi_convert_song2：将视频搜索条目转换为可播放的视频曲目。
 * - bilibili.show_playlist：按偏移和分类读取哔哩哔哩歌单列表，返回供调用方登记完成回调的对象。
 * - bilibili.bi_get_playlist：读取哔哩哔哩歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
 * - bilibili.bi_album：保留专辑入口。
 * - bilibili.bi_track：读取视频信息并把各分 P 转换为歌单曲目。
 * - bilibili.bi_convert_song3：把视频分 P 信息组合为带分集 ID 的曲目，继承作者和默认图片。
 * - bilibili.bi_artist：按列表前缀读取用户的视频或音频，视频请求使用 WBI 签名。
 * - bilibili.parse_url：识别哔哩哔哩分享链接并转换为内部列表 ID。
 * - bilibili.bootstrap_track：视频曲目读取 DASH 音轨首项，音频曲目读取 CDN 首项。
 * - bilibili.search：以每页 42 项搜索视频并转换为曲目，准备接口所需的匿名 Cookie。
 * - bilibili.lyric：当前不提供歌词，通过回调返回空原文和译文。
 * - bilibili.get_playlist：按列表 ID 前缀路由哔哩哔哩的歌单、专辑或歌手详情。
 * - bilibili.get_playlist_filters：当前没有提供筛选分类，通过回调返回空的 recommend 和 all 数组。
 * - bilibili.get_user：当前没有实现用户资料查询，通过旧回调返回失败状态和空数据。
 * - bilibili.get_login_url：返回哔哩哔哩登录入口地址。
 * - bilibili.logout：保留退出入口。
 */
/* global RequestTask */
/**
 * wbi_key：哔哩哔哩 WBI 签名键缓存，失败重试前可清空；类型为 Object|null。
 * @type {Object|null}
 */
let wbi_key = null;
/* global getParameterByName */
// eslint-disable-next-line no-unused-vars
/* global cookieSet cookieGet */
/**
 * 提供 bilibili 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 */
// eslint-disable-next-line no-unused-vars
class bilibili {
  /**
   * 通过临时 DOM 元素解码标题中的 HTML 实体。
   * @param value 待检查或转换的输入值。
   * @returns {string} 去除 HTML 实体编码后的文本。
   */
  static htmlDecode(value) {
    const parser = new DOMParser();
    return parser.parseFromString(value, 'text/html').body.textContent;
  }

  /**
   * 请求导航接口并从图片地址提取 WBI 签名所需的两段键。
   * 无参数。
   * @returns {Promise<*>} 该异步链的 Promise。
   */
  static fetch_wbi_key() {
    return axios({
      url: 'https://api.bilibili.com/x/web-interface/nav',
      method: 'get',
      responseType: 'json',
    }).then(
      /**
       * 上一步异步操作完成后，执行 img_url.slice。
       * @param resp 网络请求返回的响应对象；使用 data 字段。
       * @returns {Object} 包含 img_key、sub_key 的对象。
       */
      (resp) => {
        const json_content = resp.data;
        const { img_url } = json_content.data.wbi_img;
        const { sub_url } = json_content.data.wbi_img;
        return {
          img_key: img_url.slice(
            img_url.lastIndexOf('/') + 1,
            img_url.lastIndexOf('.')
          ),
          sub_key: sub_url.slice(
            sub_url.lastIndexOf('/') + 1,
            sub_url.lastIndexOf('.')
          ),
        };
      }
    );
  }

  /**
   * 使缓存的 WBI 键失效，供下一请求重新获取。
   * 无参数。
   * @returns {void} 无返回值。
   */
  static clear_wbi_key() {
    wbi_key = null;
  }

  /**
   * 优先复用缓存键，缺失时异步获取并保存。
   * 无参数。
   * @returns {*} Promise.resolve 的调用结果；其他分支返回 该异步链的 Promise。
   */
  static get_wbi_key() {
    if (wbi_key) {
      return Promise.resolve(wbi_key);
    }
    return bilibili.fetch_wbi_key().then(
      /**
       * 上一步异步操作完成后，更新 wbi_key。
       * @param key 索引、配置或字段名称。
       * @returns {*} key。
       */
      (key) => {
        wbi_key = key;
        return key;
      }
    );
  }

  /**
   * 加入秒级时间戳，过滤指定字符并按键排序，计算 WBI 查询签名；会修改传入参数。
   * @param params 当前请求或操作参数。
   * @returns {Promise<*>} 该异步链的 Promise。
   */
  static enc_wbi(params) {
    return bilibili.get_wbi_key().then(
      /**
       * 上一步异步操作完成后，执行 get_mixin_key。
       * @param options 解构参数，包含 img_key（WBI 图片地址中提取的主键片段）、sub_key（WBI 子图片地址中提取的补充键片段）。
       * @returns {string} 按当前字段拼接的字符串。
       */
      ({ img_key, sub_key }) => {
        const mixinKeyEncTab = [
          46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35, 27, 43,
          5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13, 37, 48, 7, 16,
          24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4, 22, 25, 54, 21, 56, 59,
          6, 63, 57, 62, 11, 36, 20, 34, 44, 52,
        ];

        // 对 imgKey 和 subKey 进行字符顺序打乱编码
        /**
         * 按固定置换表重排组合键字符，并截取前 32 个字符。
         * @param original 待按置换表重排的组合键。
         * @returns {*} temp.slice 的调用结果。
         */
        function get_mixin_key(original) {
          let temp = '';
          mixinKeyEncTab.forEach(
            /**
             * 逐项处理 mixinKeyEncTab 中的条目，更新 temp。
             * @param n 来自 mixinKeyEncTab 的当前条目。
             * @returns {void} 无返回值。
             */
            (n) => {
              temp += original[n];
            }
          );
          return temp.slice(0, 32);
        }

        const mixin_key = get_mixin_key(img_key + sub_key);
        const curr_time = Math.round(Date.now() / 1000);
        const chr_filter = /[!'()*]/g;
        const query = [];
        Object.assign(params, { wts: curr_time }); // 添加 wts 字段
        // 按照 key 重排参数
        Object.keys(params)
          .sort()
          .forEach(
            /**
             * 逐项处理 Object.keys().sort() 中的条目，执行 query.push。
             * @param key 来自 Object.keys().sort() 的当前条目。
             * @returns {void} 无返回值。
             */
            (key) => {
              query.push(
                `${encodeURIComponent(key)}=${encodeURIComponent(
                  // 过滤 value 中的 "!'()*" 字符
                  params[key].toString().replace(chr_filter, '')
                )}`
              );
            }
          );
        const query_string = query.join('&');
        const wbi_sign = window.forge.md5
          .create()
          .update(window.forge.util.encodeUtf8(query_string + mixin_key))
          .digest()
          .toHex();
        return `${query_string}&w_rid=${wbi_sign}`;
      }
    );
  }

  /**
   * 签名并请求指定接口，失败后清除缓存键并重试一次，仍失败时沿用空结果回退。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @param params 当前请求或操作参数。
   * @returns {Promise<*>} 该异步链的 Promise。
   */
  static wrap_wbi_request(url, params) {
    return bilibili
      .enc_wbi(params)
      .then(
        /**
         * 上一步异步操作完成后，执行 axios.get。
         * @param query_string 包含 WBI 时间戳与签名的查询字符串。
         * @returns {*} axios.get 的调用结果。
         */
        (query_string) => {
          const target_url = `${url}?${query_string}`;
          return axios.get(target_url);
        }
      )
      .catch(
        /**
         * 异步操作失败后，执行 bilibili.clear_wbi_key。
         * 无参数。
         * @returns {Promise<*>} 该异步链的 Promise。
         */
        () => {
          // 失败时进行一次清空 wbi_key 后的重试，避免因为 wbi_key 过期导致的错误
          bilibili.clear_wbi_key();
          return bilibili
            .enc_wbi(params)
            .then(
              /**
               * 上一步异步操作完成后，执行 axios.get。
               * @param query_string 包含 WBI 时间戳与签名的查询字符串。
               * @returns {*} axios.get 的调用结果。
               */
              (query_string) => {
                const target_url = `${url}?${query_string}`;
                return axios.get(target_url);
              }
            )
            .catch(
              /**
               * 异步操作失败后，取得 undefined。
               * 无参数。
               * @returns {undefined} undefined。
               */
              () => undefined
            );
        }
      );
  }

  /**
   * 将音频区条目转换为统一曲目。
   * @param song_info 平台返回的歌曲或视频记录；使用 id、title、uname、uid、cover、lyric 字段。
   * @returns {Object} 统一曲目对象 track。
   */
  static bi_convert_song(song_info) {
    const track = {
      id: `bitrack_${song_info.id}`,
      title: song_info.title,
      artist: song_info.uname,
      artist_id: `biartist_${song_info.uid}`,
      source: 'bilibili',
      source_url: `https://www.bilibili.com/audio/au${song_info.id}`,
      img_url: song_info.cover,
      // 停用代码，保留供历史对照：
      // url: song_info.id,
      lyric_url: song_info.lyric,
    };
    return track;
  }

  /**
   * 将视频搜索条目转换为可播放的视频曲目。
   * @param song_info 平台返回的歌曲或视频记录；使用 pic、bvid、title、author、mid 字段。
   * @returns {Object} 统一曲目对象 track。
   */
  static bi_convert_song2(song_info) {
    let imgUrl = song_info.pic;
    if (imgUrl.startsWith('//')) {
      imgUrl = `https:${imgUrl}`;
    }
    const track = {
      id: `bitrack_v_${song_info.bvid}`,
      title: this.htmlDecode(song_info.title),
      artist: this.htmlDecode(song_info.author),
      artist_id: `biartist_v_${song_info.mid}`,
      source: 'bilibili',
      source_url: `https://www.bilibili.com/${song_info.bvid}`,
      img_url: imgUrl,
    };
    return track;
  }

  /**
   * 按偏移和分类读取哔哩哔哩歌单列表，返回供调用方登记完成回调的对象。
   * @param url 携带 offset 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static show_playlist(url) {
    let offset = getParameterByName('offset', url);
    if (offset === undefined) {
      offset = 0;
    }
    const page = offset / 20 + 1;
    const target_url = `https://www.bilibili.com/audio/music-service-c/web/menu/hit?ps=20&pn=${page}`;
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
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response.data.data;
              const result = data.map(
                /**
                 * 转换 data 中的条目，包含 cover_img_url、title、id、source_url 的对象。
                 * @param item 来自 data 的当前条目；使用 cover、title、menuId 字段。
                 * @returns {Object} 包含 cover_img_url、title、id、source_url 的对象。
                 */
                (item) => ({
                  cover_img_url: item.cover,
                  title: item.title,
                  id: `biplaylist_${item.menuId}`,
                  source_url: `https://www.bilibili.com/audio/am${item.menuId}`,
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
   * 读取哔哩哔哩歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static bi_get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_').pop();
    const target_url = `https://www.bilibili.com/audio/music-service-c/web/menu/info?sid=${list_id}`;
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
             * 上一步异步操作完成后，执行 axios.get().then().catch。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {void} 无返回值。
             */
            (response) => {
              const { data } = response.data;
              const info = {
                cover_img_url: data.cover,
                title: data.title,
                id: `biplaylist_${list_id}`,
                source_url: `https://www.bilibili.com/audio/am${list_id}`,
              };
              const target = `https://www.bilibili.com/audio/music-service-c/web/song/of-menu?pn=1&ps=100&sid=${list_id}`;
              axios
                .get(target)
                .then(
                  /**
                   * 上一步异步操作完成后，调用 fn，依次传入 包含 info、tracks 的对象。
                   * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
                   * @returns {*} fn 回调的直接返回值。
                   */
                  (res) => {
                    const tracks = res.data.data.data.map(
                      /**
                       * 转换 res.data.data.data 中的条目，this.bi_convert_song 的调用结果。
                       * @param item 来自 res.data.data.data 的当前条目。
                       * @returns {*} this.bi_convert_song 的调用结果。
                       */
                      (item) => this.bi_convert_song(item)
                    );
                    return fn({
                      info,
                      tracks,
                    });
                  }
                )
                .catch(failure);
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 保留专辑入口；当前返回空曲目与空元信息。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  // eslint-disable-next-line no-unused-vars
  static bi_album(url) {
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 tracks、info 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) =>
        fn({
          tracks: [],
          info: {},
        }),
      // 当前未实现哔哩哔哩专辑查询。
      // 停用代码，保留供历史对照：
      // const album_id = getParameterByName('list_id', url).split('_').pop();
      // const target_url = '';
      // axios.get(target_url).then((response) => {
      //   const data = response.data;
      //   const info = {};
      //   const tracks = [];
      //   return fn({
      //     tracks,
      //     info,
      //   });
      // });
    };
  }

  /**
   * 读取视频信息并把各分 P 转换为歌单曲目。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static bi_track(url) {
    const track_id = getParameterByName('list_id', url).split('_').pop();
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
        const target_url = `https://api.bilibili.com/x/web-interface/view?bvid=${track_id}`;
        axios
          .get(target_url)
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 tracks、info 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const info = {
                cover_img_url: response.data.data.pic,
                title: response.data.data.title,
                id: `bitrack_v_${track_id}`,
                source_url: `https://www.bilibili.com/${track_id}`,
              };
              const author = response.data.data.owner;
              const default_img = response.data.data.pic;
              const tracks = response.data.data.pages.map(
                /**
                 * 转换 response.data.data.pages 中的条目，this.bi_convert_song3 的调用结果。
                 * @param item 来自 response.data.data.pages 的当前条目。
                 * @returns {*} this.bi_convert_song3 的调用结果。
                 */
                (item) =>
                  this.bi_convert_song3(item, track_id, author, default_img)
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
   * 把视频分 P 信息组合为带分集 ID 的曲目，继承作者和默认图片。
   * @param song_info 平台返回的歌曲或视频记录；使用 first_frame、cid、part、page 字段。
   * @param bvid 视频 BV 标识。
   * @param author 视频作者资料；使用 name、mid 字段。
   * @param default_img 分 P 没有独立图片时使用的封面地址。
   * @returns {Object} 统一曲目对象 track。
   */
  static bi_convert_song3(song_info, bvid, author, default_img) {
    let imgUrl = song_info.first_frame;
    if (imgUrl === undefined) {
      imgUrl = default_img;
    } else if (imgUrl.startsWith('//')) {
      imgUrl = `https:${imgUrl}`;
    }
    const track = {
      id: `bitrack_v_${bvid}-${song_info.cid}`,
      title: this.htmlDecode(song_info.part),
      artist: this.htmlDecode(author.name),
      artist_id: `biartist_v_${author.mid}`,
      source: 'bilibili',
      source_url: `https://www.bilibili.com/${bvid}/?p=${song_info.page}`,
      img_url: imgUrl,
    };
    return track;
  }

  /**
   * 按列表前缀读取用户的视频或音频，视频请求使用 WBI 签名。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static bi_artist(url) {
    const artist_id = getParameterByName('list_id', url).split('_').pop();

    return {
      /**
       * 登记或执行旧式成功入口，执行 bilibili.wrap_wbi_request().then；业务结果通过 fn 传出。
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
        let target_url;
        bilibili
          .wrap_wbi_request('https://api.bilibili.com/x/space/wbi/acc/info', {
            mid: artist_id,
          })
          .then(
            /**
             * 上一步异步操作完成后，更新 target_url，执行 axios.get().then().catch。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {Promise<*>} 该异步链的 Promise。
             */
            (response) => {
              const info = {
                cover_img_url: response.data.data.face,
                title: response.data.data.name,
                id: `biartist_${artist_id}`,
                source_url: `https://space.bilibili.com/${artist_id}/#/audio`,
              };
              if (getParameterByName('list_id', url).split('_').length === 3) {
                return bilibili
                  .wrap_wbi_request(
                    'https://api.bilibili.com/x/space/wbi/arc/search',
                    {
                      mid: artist_id,
                      pn: 1,
                      ps: 25,
                      order: 'click',
                      index: 1,
                    }
                  )
                  .then(
                    /**
                     * 上一步异步操作完成后，调用 fn，依次传入 包含 tracks、info 的对象。
                     * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
                     * @returns {*} fn 回调的直接返回值。
                     */
                    (res) => {
                      const tracks = res.data.data.list.vlist.map(
                        /**
                         * 转换 res.data.data.list.vlist 中的条目，this.bi_convert_song2 的调用结果。
                         * @param item 来自 res.data.data.list.vlist 的当前条目。
                         * @returns {*} this.bi_convert_song2 的调用结果。
                         */
                        (item) => this.bi_convert_song2(item)
                      );
                      return fn({
                        tracks,
                        info,
                      });
                    }
                  );
              }
              target_url = `https://api.bilibili.com/audio/music-service-c/web/song/upper?pn=1&ps=0&order=2&uid=${artist_id}`;
              return axios
                .get(target_url)
                .then(
                  /**
                   * 上一步异步操作完成后，调用 fn，依次传入 包含 tracks、info 的对象。
                   * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
                   * @returns {*} fn 回调的直接返回值。
                   */
                  (res) => {
                    const tracks = res.data.data.data.map(
                      /**
                       * 转换 res.data.data.data 中的条目，this.bi_convert_song 的调用结果。
                       * @param item 来自 res.data.data.data 的当前条目。
                       * @returns {*} this.bi_convert_song 的调用结果。
                       */
                      (item) => this.bi_convert_song(item)
                    );
                    return fn({
                      tracks,
                      info,
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
   * 识别哔哩哔哩分享链接并转换为内部列表 ID；通过 success 回调交出匹配结果，无匹配时为 undefined。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static parse_url(url) {
    let result;
    const match = /\/\/www.bilibili.com\/audio\/am([0-9]+)/.exec(url);
    if (match != null) {
      const playlist_id = match[1];
      result = {
        type: 'playlist',
        id: `biplaylist_${playlist_id}`,
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
   * 视频曲目读取 DASH 音轨首项，音频曲目读取 CDN 首项；带分 P 的 ID 先解析对应 cid。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 id 字段。
   * @param success 接收成功业务结果的回调。
   * @param failure 接收失败原因的回调；省略时沿用声明中的默认处理。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {Promise<*>} 该异步链的 Promise。
   */
  static bootstrap_track(track, success, failure, options = {}) {
    const request = RequestTask.http(options);
    const trackId = track.id;
    if (trackId.startsWith('bitrack_v_')) {
      const sound = {};
      let bvid = track.id.slice('bitrack_v_'.length);

      const trackIdCheck = trackId.split('-');
      if (trackIdCheck.length > 1) {
        bvid = trackIdCheck[0].slice('bitrack_v_'.length);
      }
      const target_url = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
      return request
        .get(target_url)
        .then(
          /**
           * 上一步异步操作完成后，更新 [, cid]，执行 request.get().then().catch。
           * @param response 异步请求返回的响应对象；使用 data 字段。
           * @returns {void} 无返回值。
           */
          (response) => {
            let { cid } = response.data.data.pages[0];
            if (trackIdCheck.length > 1) {
              [, cid] = trackIdCheck;
            }
            const target_url2 = `http://api.bilibili.com/x/player/playurl?fnval=16&bvid=${bvid}&cid=${cid}`;
            request
              .get(target_url2)
              .then(
                /**
                 * 上一步异步操作完成后，更新 sound.url、sound.platform，调用 success，依次传入 播放地址对象 sound。
                 * @param response2 后续分集音频请求的响应对象；使用 data 字段。
                 * @returns {void} 无返回值。
                 */
                (response2) => {
                  if (response2.data.data.dash.audio.length > 0) {
                    const url = response2.data.data.dash.audio[0].baseUrl;
                    sound.url = url;
                    sound.platform = 'bilibili';
                    success(sound);
                  } else {
                    failure(sound);
                  }
                }
              )
              .catch(failure);
          }
        )
        .catch(failure);
    }
    const sound = {};
    const song_id = track.id.slice('bitrack_'.length);
    const target_url = `https://www.bilibili.com/audio/music-service-c/web/url?sid=${song_id}`;
    return request
      .get(target_url)
      .then(
        /**
         * 上一步异步操作完成后，更新 [sound.url]、sound.platform，调用 success，依次传入 播放地址对象 sound。
         * @param response 异步请求返回的响应对象。
         * @returns {void} 无返回值。
         */
        (response) => {
          const { data } = response;
          if (data.code === 0) {
            [sound.url] = data.data.cdns;
            sound.platform = 'bilibili';

            success(sound);
          } else {
            failure(sound);
          }
        }
      )
      .catch(failure);
  }

  /**
   * 以每页 42 项搜索视频并转换为曲目，准备接口所需的匿名 Cookie。
   * @param url 携带 keywords、curpage 查询参数的内部请求地址。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static search(url, options = {}) {
    const request = RequestTask.http(options);
    return {
      /**
       * 登记或执行旧式成功入口，执行 getParameterByName（"keywords"）；业务结果通过 fn 传出。
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
        const keyword = getParameterByName('keywords', url);
        const curpage = getParameterByName('curpage', url);

        const target_url = `https://api.bilibili.com/x/web-interface/search/type?__refresh__=true&_extra=&context=&page=${curpage}&page_size=42&platform=pc&highlight=1&single_column=0&keyword=${encodeURIComponent(
          keyword
        )}&category_id=&search_type=video&dynamic_offset=0&preload=true&com2co=true`;

        const domain = `https://api.bilibili.com`;
        const cookieName = 'buvid3';
        const expire =
          (new Date().getTime() + 1e3 * 60 * 60 * 24 * 365 * 100) / 1000;

        cookieSet(
          {
            url: domain,
            name: cookieName,
            value: '0',
            expirationDate: expire,
            sameSite: 'no_restriction',
          },
          /**
           * 进入此回调后，执行 request.get().then().catch。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            request
              .get(target_url, { withCredentials: true })
              .then(
                /**
                 * 上一步异步操作完成后，调用 fn，依次传入 包含 result、total、pageSize 的对象。
                 * @param response 异步请求返回的响应对象；使用 data 字段。
                 * @returns {*} fn 回调的直接返回值。
                 */
                (response) => {
                  const result = response.data.data.result.map(
                    /**
                     * 转换 response.data.data.result 中的条目，this.bi_convert_song2 的调用结果。
                     * @param song 来自 response.data.data.result 的当前条目。
                     * @returns {*} this.bi_convert_song2 的调用结果。
                     */
                    (song) => this.bi_convert_song2(song)
                  );
                  const total = response.data.data.numResults;
                  return fn({
                    result,
                    total,
                    pageSize:
                      response.data.data.pagesize ||
                      response.data.data.page_size ||
                      result.length ||
                      42,
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
   * 当前不提供歌词，通过回调返回空原文和译文。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lyric() {
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 lyric 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success: (fn) => {
        fn({
          lyric: '',
        });
      },
    };
  }

  /**
   * 按列表 ID 前缀路由哔哩哔哩的歌单、专辑或歌手详情；不支持的前缀返回 null。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {*} 根据当前分支返回相应结果，可能的形式为 *、null。
   */
  static get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_')[0];
    switch (list_id) {
      case 'biplaylist':
        return this.bi_get_playlist(url);
      case 'bialbum':
        return this.bi_album(url);
      case 'biartist':
        return this.bi_artist(url);
      case 'bitrack':
        return this.bi_track(url);
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
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn({ status: 'fail', data: {} }),
    };
  }

  /**
   * 返回哔哩哔哩登录入口地址。
   * 无参数。
   * @returns {string} 按当前字段拼接的字符串。
   */
  static get_login_url() {
    return `https://www.bilibili.com`;
  }

  /**
   * 保留退出入口；当前函数体为空，不修改认证状态。
   * 无参数。
   * @returns {void} 无返回值。
   */
  static logout() {}

  // 停用代码，保留供历史对照：
  // return {
  //   show_playlist: bi_show_playlist,
  //   get_playlist_filters,
  //   get_playlist,
  //   parse_url: bi_parse_url,
  //   bootstrap_track: bi_bootstrap_track,
  //   search: bi_search,
  //   lyric: bi_lyric,
  //   get_user: bi_get_user,
  //   get_login_url: bi_get_login_url,
  //   logout: bi_logout,
  // };
}
