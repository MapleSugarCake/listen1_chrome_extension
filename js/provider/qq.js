/**
 * 文件职责：适配 QQ 音乐搜索、榜单、歌单、用户和歌词接口，将两类曲目结构转换为统一协议并请求播放地址。
 *
 * 文件级定义：
 * - qq：提供 qq 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 * - qq.htmlDecode：通过临时 DOM 元素解码接口文本中的 HTML 实体。
 * - qq.qq_show_toplist：读取QQ 音乐榜单目录。
 * - qq.show_playlist：按偏移和分类读取QQ 音乐歌单列表，返回供调用方登记完成回调的对象。
 * - qq.qq_get_image_url：根据 QQ 图片标识和歌手／专辑类型拼接封面地址。
 * - qq.qq_is_playable：读取动作位字段中当前实现使用的播放标记。
 * - qq.qq_convert_song：将旧 QQ songmid 数据结构转换为统一曲目，使用 qq 路由前缀并保留专辑、歌手和封面信息。
 * - qq.qq_convert_song2：将新 QQ musicData 数据结构转换为统一曲目，保留备用音源和歌词所需字段。
 * - qq.get_toplist_url：构造含榜单 ID、周期和数量限制的榜单请求地址。
 * - qq.get_periods：抓取榜单页面并提取当前榜单周期，返回异步解析结果。
 * - qq.qq_toplist：读取榜单元信息及前 100 首歌曲。
 * - qq.qq_get_playlist：读取QQ 音乐歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
 * - qq.qq_album：读取QQ 音乐专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
 * - qq.qq_artist：读取QQ 音乐歌手资料与接口提供的歌曲列表，转换为统一列表详情。
 * - qq.search：调用桌面搜索接口，每页 50 项。
 * - qq.UnicodeToAscii：替换文本中的数字实体。
 * - qq.bootstrap_track：以 128 kbps 参数请求 vkey 并拼接地址。
 * - qq.str2ab：将字符串各字符的低八位写入 ArrayBuffer。
 * - qq.lyric：读取QQ 音乐原文和可用的译文歌词，沿用 lyric／tlyric 响应字段。
 * - qq.parse_url：识别QQ 音乐分享链接并转换为内部列表 ID。
 * - qq.get_playlist：按列表 ID 前缀路由QQ 音乐的歌单、专辑或歌手详情。
 * - qq.get_playlist_filters：提供QQ 音乐的推荐分类与全部分类，通过 success 回调交出筛选结构。
 * - qq.get_user_by_uin：按 QQ 用户标识查询资料并转换为统一用户数据。
 * - qq.get_user_created_playlist：取得QQ 音乐用户创建的歌单。
 * - qq.get_user_favorite_playlist：取得QQ 音乐用户收藏的歌单。
 * - qq.get_recommend_playlist：取得QQ 音乐推荐给当前会话的歌单。
 * - qq.get_user：优先读取 uin，否则读取 wxuin，处理现有前缀规则后查询用户资料。
 * - qq.get_login_url：返回QQ 音乐登录入口地址。
 * - qq.logout：清除QQ 音乐使用的认证 Cookie。
 */
/* global RequestTask */
/* exported qq */

/* global getParameterByName cookieGet cookieRemove */

// 来源使用静态方法，无需创建实例，
// MediaService 按条目 ID 前缀选择调用目标。
/**
 * 提供 qq 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 */
class qq {
  /**
   * 通过临时 DOM 元素解码接口文本中的 HTML 实体。
   * @param value 待检查或转换的输入值。
   * @returns {string} 去除 HTML 实体编码后的文本。
   */
  static htmlDecode(value) {
    const parser = new DOMParser();
    return parser.parseFromString(value, 'text/html').body.textContent;
  }

  /**
   * 读取QQ 音乐榜单目录；非首屏偏移直接返回空列表，避免重复追加。
   * @param offset 从列表开头跳过的条目数量。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static qq_show_toplist(offset) {
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
    const url =
      'https://c.y.qq.com/v8/fcg-bin/fcg_myqq_toplist.fcg?g_tk=5381&inCharset=utf-8&outCharset=utf-8&notice=0&format=json&uin=0&needNewCode=1&platform=h5';

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
          .get(url)
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 result 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const result = [];
              response.data.data.topList.forEach(
                /**
                 * 逐项处理 response.data.data.topList 中的条目，执行 result.push。
                 * @param item 来自 response.data.data.topList 的当前条目；使用 picUrl、id、topTitle 字段。
                 * @returns {void} 无返回值。
                 */
                (item) => {
                  const playlist = {
                    cover_img_url: item.picUrl,
                    id: `qqtoplist_${item.id}`,
                    source_url: `https://y.qq.com/n/yqq/toplist/${item.id}.html`,
                    title: item.topTitle,
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
   * 按偏移和分类读取QQ 音乐歌单列表，返回供调用方登记完成回调的对象。
   * @param url 携带 offset、filter_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static show_playlist(url) {
    const offset = Number(getParameterByName('offset', url)) || 0;
    let filterId = getParameterByName('filter_id', url) || '';
    if (filterId === 'toplist') {
      return this.qq_show_toplist(offset);
    }
    if (filterId === '') {
      filterId = '10000000';
    }

    const target_url =
      'https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_by_tag.fcg' +
      `?picmid=1&rnd=${Math.random()}&g_tk=732560869` +
      '&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8' +
      '&notice=0&platform=yqq.json&needNewCode=0' +
      `&categoryId=${filterId}&sortId=5&sin=${offset}&ein=${29 + offset}`;

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

              const playlists = data.data.list.map(
                /**
                 * 转换 data.data.list 中的条目，包含 cover_img_url、title、id、source_url 的对象。
                 * @param item 来自 data.data.list 的当前条目；使用 imgurl、dissname、dissid 字段。
                 * @returns {Object} 包含 cover_img_url、title、id、source_url 的对象。
                 */
                (item) => ({
                  cover_img_url: item.imgurl,
                  title: this.htmlDecode(item.dissname),
                  id: `qqplaylist_${item.dissid}`,
                  source_url: `https://y.qq.com/n/ryqq/playlist/${item.dissid}`,
                })
              );

              return fn({
                result: playlists,
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 根据 QQ 图片标识和歌手／专辑类型拼接封面地址。
   * @param qqimgid QQ 图片资源标识。
   * @param img_type 图片类别，区分歌手或专辑。
   * @returns {string} ""；其他分支返回 url。
   */
  static qq_get_image_url(qqimgid, img_type) {
    if (qqimgid == null) {
      return '';
    }
    let category = '';
    if (img_type === 'artist') {
      category = 'T001R300x300M000';
    }
    if (img_type === 'album') {
      category = 'T002R300x300M000';
    }
    const s = category + qqimgid;
    const url = `https://y.gtimg.cn/music/photo_new/${s}.jpg`;
    return url;
  }

  /**
   * 读取动作位字段中当前实现使用的播放标记。
   * @param song 来源歌曲记录或当前页面曲目；使用 switch 字段。
   * @returns {*} play_flag 是否严格等于 "1"，为空或假值时使用 play_flag 是否严格等于 "1" 且 try_flag 是否严格等于 "1"。
   */
  static qq_is_playable(song) {
    const switch_flag = song.switch.toString(2).split('');
    switch_flag.pop();
    switch_flag.reverse();
    // 接口动作位的字段顺序如下：
    // ["play_lq", "play_hq", "play_sq", "down_lq", "down_hq", "down_sq", "soso",
    //  "fav", "share", "bgm", "ring", "sing", "radio", "try", "give"]
    const play_flag = switch_flag[0];
    const try_flag = switch_flag[13];
    return play_flag === '1' || (play_flag === '1' && try_flag === '1');
  }

  /**
   * 将旧 QQ songmid 数据结构转换为统一曲目，使用 qq 路由前缀并保留专辑、歌手和封面信息。
   * @param song 来源歌曲记录或当前页面曲目；使用 songmid、songname、singer、albumname、albummid 字段。
   * @returns {Object} d。
   */
  static qq_convert_song(song) {
    // 将 QQ 接口数据规范为播放器、歌单、搜索
    // 和备用来源使用的统一曲目结构。
    const d = {
      id: `qqtrack_${song.songmid}`,
      title: this.htmlDecode(song.songname),
      artist: this.htmlDecode(song.singer[0].name),
      artist_id: `qqartist_${song.singer[0].mid}`,
      album: this.htmlDecode(song.albumname),
      album_id: `qqalbum_${song.albummid}`,
      img_url: this.qq_get_image_url(song.albummid, 'album'),
      source: 'qq',
      source_url: `https://y.qq.com/#type=song&mid=${song.songmid}&tpl=yqq_song_detail`,
      // 停用代码，保留供历史对照：
      // url: `qqtrack_${song.songmid}`,
      url: !qq.qq_is_playable(song) ? '' : undefined,
    };
    return d;
  }

  /**
   * 将新 QQ musicData 数据结构转换为统一曲目，保留备用音源和歌词所需字段。
   * @param song 来源歌曲记录或当前页面曲目；使用 mid、name、singer、album 字段。
   * @returns {Object} d。
   */
  static qq_convert_song2(song) {
    const d = {
      id: `qqtrack_${song.mid}`,
      title: this.htmlDecode(song.name),
      artist: this.htmlDecode(song.singer[0].name),
      artist_id: `qqartist_${song.singer[0].mid}`,
      album: this.htmlDecode(song.album.name),
      album_id: `qqalbum_${song.album.mid}`,
      img_url: this.qq_get_image_url(song.album.mid, 'album'),
      source: 'qq',
      source_url: `https://y.qq.com/#type=song&mid=${song.mid}&tpl=yqq_song_detail`,
      url: '',
    };
    return d;
  }

  /**
   * 构造含榜单 ID、周期和数量限制的榜单请求地址。
   * @param id 目标条目的唯一标识。
   * @param period 榜单周期。
   * @param limit 请求的最大条目数。
   * @returns {string} 按当前字段拼接的字符串。
   */
  static get_toplist_url(id, period, limit) {
    return `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&data=${encodeURIComponent(
      JSON.stringify({
        comm: {
          cv: 1602,
          ct: 20,
        },
        toplist: {
          module: 'musicToplist.ToplistInfoServer',
          method: 'GetDetail',
          param: {
            topid: id,
            num: limit,
            period,
          },
        },
      })
    )}`;
  }

  /**
   * 抓取榜单页面并提取当前榜单周期，返回异步解析结果。
   * @param topid QQ 榜单 ID。
   * @returns {Promise<*>} 该异步链的 Promise。
   */
  static get_periods(topid) {
    const periodUrl = 'https://c.y.qq.com/node/pc/wk_v15/top.html';
    const regExps = {
      periodList:
        /<i class="play_cover__btn c_tx_link js_icon_play" data-listkey=".+?" data-listname=".+?" data-tid=".+?" data-date=".+?" .+?<\/i>/g,
      period:
        /data-listname="(.+?)" data-tid=".*?\/(.+?)" data-date="(.+?)" .+?<\/i>/,
    };
    const periods = {};
    return axios.get(periodUrl).then(
      /**
       * 上一步异步操作完成后，执行 html.match。
       * @param response 异步请求返回的响应对象；使用 data 字段。
       * @returns {*} Promise.reject 的调用结果；其他分支返回 列表元信息 info 且 info.period。
       */
      (response) => {
        const html = response.data;
        const pl = html.match(regExps.periodList);
        if (!pl) return Promise.reject();
        pl.forEach(
          /**
           * 逐项处理 pl 中的条目，更新 periods[pr[2]]，执行 p.match。
           * @param p 来自 pl 的当前条目；使用 match 字段。
           * @returns {void} 无返回值。
           */
          (p) => {
            const pr = p.match(regExps.period);
            if (!pr) return;
            periods[pr[2]] = {
              name: pr[1],
              id: pr[2],
              period: pr[3],
            };
          }
        );
        const info = periods[topid];
        return info && info.period;
      }
    );
  }

  /**
   * 读取榜单元信息及前 100 首歌曲；当前实现尚未遍历更多页。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static qq_toplist(url) {
    // 感谢 lx-music-desktop 的榜单解析方案。
    // https://github.com/lyswhut/lx-music-desktop/blob/24521bf50d80512a44048596639052e3194b2bf1/src/renderer/utils/music/tx/leaderboard.js

    const list_id = Number(getParameterByName('list_id', url).split('_').pop());

    return {
      /**
       * 登记或执行旧式成功入口，执行 this.get_periods().then；业务结果通过 fn 传出。
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
        this.get_periods(list_id).then(
          /**
           * 上一步异步操作完成后，执行 axios.get().then().catch。
           * @param listPeriod 从榜单页面提取的当前榜单周期。
           * @returns {void} 无返回值。
           */
          (listPeriod) => {
            const limit = 100;
            // TODO：继续遍历榜单的其余页面。
            const target_url = this.get_toplist_url(list_id, listPeriod, limit);

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
                  const tracks = data.toplist.data.songInfoList.map(
                    /**
                     * 转换 data.toplist.data.songInfoList 中的条目，执行 this.htmlDecode。
                     * @param song 来自 data.toplist.data.songInfoList 的当前条目；使用 mid、name、singer、album 字段。
                     * @returns {Object} d。
                     */
                    (song) => {
                      const d = {
                        id: `qqtrack_${song.mid}`,
                        title: this.htmlDecode(song.name),
                        artist: this.htmlDecode(song.singer[0].name),
                        artist_id: `qqartist_${song.singer[0].mid}`,
                        album: this.htmlDecode(song.album.name),
                        album_id: `qqalbum_${song.album.mid}`,
                        img_url: this.qq_get_image_url(song.album.mid, 'album'),
                        source: 'qq',
                        source_url: `https://y.qq.com/#type=song&mid=${song.mid}&tpl=yqq_song_detail`,
                      };
                      return d;
                    }
                  );
                  const info = {
                    cover_img_url: data.toplist.data.data.frontPicUrl,
                    title: data.toplist.data.data.title,
                    id: `qqtoplist_${list_id}`,
                    source_url: `https://y.qq.com/n/yqq/toplist/${list_id}.html`,
                  };
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
   * 读取QQ 音乐歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static qq_get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_').pop();

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
          'https://i.y.qq.com/qzone-music/fcg-bin/fcg_ucc_getcdinfo_' +
          'byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0' +
          `&nosign=1&disstid=${list_id}&g_tk=5381&loginUin=0&hostUin=0` +
          '&format=json&inCharset=GB2312&outCharset=utf-8&notice=0' +
          '&platform=yqq&needNewCode=0';
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
                cover_img_url: data.cdlist[0].logo,
                title: data.cdlist[0].dissname,
                id: `qqplaylist_${list_id}`,
                source_url: `https://y.qq.com/n/ryqq/playlist/${list_id}`,
              };

              const tracks = data.cdlist[0].songlist.map(
                /**
                 * 转换 data.cdlist[0].songlist 中的条目，this.qq_convert_song 的调用结果。
                 * @param item 来自 data.cdlist[0].songlist 的当前条目。
                 * @returns {*} this.qq_convert_song 的调用结果。
                 */
                (item) => this.qq_convert_song(item)
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
   * 读取QQ 音乐专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static qq_album(url) {
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
          'https://i.y.qq.com/v8/fcg-bin/fcg_v8_album_info_cp.fcg' +
          `?platform=h5page&albummid=${album_id}&g_tk=938407465` +
          '&uin=0&format=json&inCharset=utf-8&outCharset=utf-8' +
          '&notice=0&platform=h5&needNewCode=1&_=1459961045571';
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
                cover_img_url: this.qq_get_image_url(album_id, 'album'),
                title: data.data.name,
                id: `qqalbum_${album_id}`,
                source_url: `https://y.qq.com/#type=album&mid=${album_id}`,
              };

              const tracks = data.data.list.map(
                /**
                 * 转换 data.data.list 中的条目，this.qq_convert_song 的调用结果。
                 * @param item 来自 data.data.list 的当前条目。
                 * @returns {*} this.qq_convert_song 的调用结果。
                 */
                (item) => this.qq_convert_song(item)
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
   * 读取QQ 音乐歌手资料与接口提供的歌曲列表，转换为统一列表详情。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static qq_artist(url) {
    const artist_id = getParameterByName('list_id', url).split('_').pop();

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
        const target_url = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&loginUin=0&hostUin=0inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&data=${encodeURIComponent(
          JSON.stringify({
            comm: {
              ct: 24,
              cv: 0,
            },
            singer: {
              method: 'get_singer_detail_info',
              param: {
                sort: 5,
                singermid: artist_id,
                sin: 0,
                num: 50,
              },
              module: 'music.web_singer_info_svr',
            },
          })
        )}`;

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
                cover_img_url: this.qq_get_image_url(artist_id, 'artist'),
                title: data.singer.data.singer_info.name,
                id: `qqartist_${artist_id}`,
                source_url: `https://y.qq.com/#type=singer&mid=${artist_id}`,
              };

              const tracks = data.singer.data.songlist.map(
                /**
                 * 转换 data.singer.data.songlist 中的条目，this.qq_convert_song2 的调用结果。
                 * @param item 来自 data.singer.data.songlist 的当前条目。
                 * @returns {*} this.qq_convert_song2 的调用结果。
                 */
                (item) => this.qq_convert_song2(item)
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
   * 调用桌面搜索接口，每页 50 项；检查业务错误并区分歌曲与歌单结果。
   * @param url 携带 keywords、curpage、type 查询参数的内部请求地址。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static search(url, options = {}) {
    const request = RequestTask.http(options);

    const keyword = getParameterByName('keywords', url);
    const curpage = getParameterByName('curpage', url);
    const searchType = getParameterByName('type', url);

    // 接口方案参考 lx-music-desktop。
    // https://github.com/lyswhut/lx-music-desktop/blob/master/src/renderer/utils/music/tx/musicSearch.js
    const target_url = 'https://u.y.qq.com/cgi-bin/musicu.fcg';

    const searchTypeMapping = {
      0: 0,
      1: 3,
    };

    return {
      /**
       * 登记或执行旧式成功入口，执行 request.post().then().catch；业务结果通过 fn 传出。
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
        const limit = 50;
        const page = curpage;
        const query = {
          comm: {
            ct: '19',
            cv: '1859',
            uin: '0',
          },
          req: {
            method: 'DoSearchForQQMusicDesktop',
            module: 'music.search.SearchCgiService',
            param: {
              grp: 1,
              num_per_page: limit,
              page_num: parseInt(page, 10),
              query: keyword,
              search_type: searchTypeMapping[searchType],
            },
          },
        };
        request
          .post(target_url, query)
          .then(
            /**
             * 上一步异步操作完成后，更新 result、total，调用 failure，依次传入 包含 code、businessCode 的对象。
             * @param response 异步请求返回的响应对象。
             * @returns {*} undefined；其他分支返回 fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response;
              const businessCode = data?.code || data?.req?.code;
              if (businessCode) {
                failure({ code: 'SERVICE_ERROR', businessCode });
                return undefined;
              }
              let result = [];
              let total = 0;
              if (searchType === '0') {
                result = data.req.data.body.song.list.map(
                  /**
                   * 转换 data.req.data.body.song.list 中的条目，this.qq_convert_song2 的调用结果。
                   * @param item 来自 data.req.data.body.song.list 的当前条目。
                   * @returns {*} this.qq_convert_song2 的调用结果。
                   */
                  (item) => this.qq_convert_song2(item)
                );
                total = data.req.data.meta.sum;
              } else if (searchType === '1') {
                result = data.req.data.body.songlist.list.map(
                  /**
                   * 转换 data.req.data.body.songlist.list 中的条目，包含 id、title、source、source_url、img_url、url、author、count 的对象。
                   * @param info 来自 data.req.data.body.songlist.list 的当前条目；使用 dissid、dissname、imgurl、creator、song_count 字段。
                   * @returns {Object} 包含 id、title、source、source_url、img_url、url、author、count 的对象。
                   */
                  (info) => ({
                    id: `qqplaylist_${info.dissid}`,
                    title: this.htmlDecode(info.dissname),
                    source: 'qq',
                    source_url: `https://y.qq.com/n/ryqq/playlist/${info.dissid}`,
                    img_url: info.imgurl,
                    url: `qqplaylist_${info.dissid}`,
                    author: this.UnicodeToAscii(info.creator.name),
                    count: info.song_count,
                  })
                );
                total = data.req.data.meta.sum;
              }
              return fn({
                result,
                total,
                type: searchType,
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 替换文本中的数字实体；当前箭头回调沿用外层 arguments，保留既有实现。
   * @param str 待转换的字符串。
   * @returns {string} 整理后的结果 result。
   */
  static UnicodeToAscii(str) {
    const result = str.replace(
      /&#(\d+);/g,
      /**
       * 进入此回调后，执行 String.fromCharCode。
       * 无参数。
       * @returns {*} String.fromCharCode 的调用结果。
       */
      () =>
        // eslint-disable-next-line prefer-rest-params
        String.fromCharCode(arguments[1])
    );
    return result;
  }

  /**
   * 以 128 kbps 参数请求 vkey 并拼接地址；空地址进入失败回调，不据此推断会员限制。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 id 字段。
   * @param success 接收成功业务结果的回调。
   * @param failure 接收失败原因的回调；省略时沿用声明中的默认处理。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {void} 无返回值。
   */
  static bootstrap_track(track, success, failure, options = {}) {
    const request = RequestTask.http(options);
    const sound = {};
    const songId = track.id.slice('qqtrack_'.length);
    const target_url = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
    // 参考实现：https://github.com/Rain120/qq-music-api/blob/2b9cb811934888a532545fbd0bf4e4ab2aea5dbe/routers/context/getMusicPlay.js
    const guid = '10000';
    const songmidList = [songId];
    const uin = '0';

    // 沿用 128 kbps 请求参数，避免旧 320 kbps 参数无法返回地址。
    const fileType = '128';
    const fileConfig = {
      m4a: {
        s: 'C400',
        e: '.m4a',
        bitrate: 'M4A',
      },
      128: {
        s: 'M500',
        e: '.mp3',
        bitrate: '128kbps',
      },
      320: {
        s: 'M800',
        e: '.mp3',
        bitrate: '320kbps',
      },
      ape: {
        s: 'A000',
        e: '.ape',
        bitrate: 'APE',
      },
      flac: {
        s: 'F000',
        e: '.flac',
        bitrate: 'FLAC',
      },
    };
    const fileInfo = fileConfig[fileType];
    const file =
      songmidList.length === 1 &&
      `${fileInfo.s}${songId}${songId}${fileInfo.e}`;

    const reqData = {
      req_1: {
        module: 'vkey.GetVkeyServer',
        method: 'CgiGetVkey',
        param: {
          filename: file ? [file] : [],
          guid,
          songmid: songmidList,
          songtype: [0],
          uin,
          loginflag: 1,
          platform: '20',
        },
      },
      loginUin: uin,
      comm: {
        uin,
        format: 'json',
        ct: 24,
        cv: 0,
      },
    };
    request
      .post(target_url, reqData)
      .then(
        /**
         * 上一步异步操作完成后，更新 sound.url、sound.bitrate、sound.platform，调用 failure，依次传入 包含 code、businessCode 的对象。
         * @param response 异步请求返回的响应对象。
         * @returns {void} 无返回值。
         */
        (response) => {
          const { data } = response;
          const detail = data.req_1;
          if (!detail?.data?.midurlinfo?.length) {
            failure({
              code: 'INVALID_RESPONSE',
              businessCode: detail?.code ?? data.code,
            });
            return;
          }
          const { purl } = detail.data.midurlinfo[0];

          if (purl === '') {
            // 空 vkey 不能单独证明歌曲仅限会员。
            failure({
              code: 'RESOURCE_UNAVAILABLE',
              businessCode: detail.code,
            });
            return;
          }
          const url = data.req_1.data.sip[0] + purl;
          sound.url = url;
          const prefix = purl.slice(0, 4);
          const found = Object.values(fileConfig).filter(
            /**
             * 筛选检查 Object.values() 中的条目，i.s 是否严格等于 prefix。
             * @param i 来自 Object.values() 的当前条目；使用 s 字段。
             * @returns {boolean} i.s 是否严格等于 prefix。
             */
            (i) => i.s === prefix
          );
          sound.bitrate = found.length > 0 ? found[0].bitrate : '';
          sound.platform = 'qq';

          success(sound);
        }
      )
      .catch(failure);
  }

  /**
   * 将字符串各字符的低八位写入 ArrayBuffer。
   * @param str 待转换的字符串；使用 charCodeAt 字段。
   * @returns {ArrayBuffer} buf。
   */
  static str2ab(str) {
    // 将字符串写入字节缓冲区。
    const buf = new ArrayBuffer(str.length);
    const bufView = new Uint8Array(buf);
    for (let i = 0, strLen = str.length; i < strLen; i += 1) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
  }

  /**
   * 读取QQ 音乐原文和可用的译文歌词，沿用 lyric／tlyric 响应字段。
   * @param url 携带 track_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lyric(url) {
    const track_id = getParameterByName('track_id', url).split('_').pop();
    // 请求头由所在桌面或扩展环境的适配层处理。
    const target_url =
      'https://i.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg?' +
      `songmid=${track_id}&g_tk=5381&format=json&inCharset=utf8&outCharset=utf-8&nobase64=1`;
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
             * 上一步异步操作完成后，调用 fn，依次传入 包含 lyric、tlyric 的对象。
             * @param response 异步请求返回的响应对象。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response;
              const lrc = data.lyric || '';
              const tlrc = data.trans.replace(/\/\//g, '') || '';
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
   * 识别QQ 音乐分享链接并转换为内部列表 ID；通过 success 回调交出匹配结果，无匹配时为 undefined。
   * @param url 携带 id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static parse_url(url) {
    return {
      /**
       * 登记或执行旧式成功入口，更新 result、match，调用 fn，依次传入 整理后的结果 result；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} 该异步链的 Promise；其他分支返回 fn 回调的直接返回值。
       */
      success: (fn) => {
        let result;

        let match = /\/\/y.qq.com\/n\/yqq\/playlist\/([0-9]+)/.exec(url);
        if (match != null) {
          const playlist_id = match[1];
          result = {
            type: 'playlist',
            id: `qqplaylist_${playlist_id}`,
          };
        }
        match = /\/\/y.qq.com\/n\/yqq\/playsquare\/([0-9]+)/.exec(url);
        if (match != null) {
          const playlist_id = match[1];
          result = {
            type: 'playlist',
            id: `qqplaylist_${playlist_id}`,
          };
        }
        match =
          /\/\/y.qq.com\/n\/m\/detail\/taoge\/index.html\?id=([0-9]+)/.exec(
            url
          );
        if (match != null) {
          const playlist_id = match[1];
          result = {
            type: 'playlist',
            id: `qqplaylist_${playlist_id}`,
          };
        }

        // 待解析的短链接示例：c.y.qq.com/base/fcgi-bin/u?__=1MsbSLu
        match = /\/\/c.y.qq.com\/base\/fcgi-bin\/u\?__=([0-9a-zA-Z]+)/.exec(
          url
        );
        if (match != null) {
          return axios
            .get(url)
            .then(
              /**
               * 上一步异步操作完成后，更新 result，调用 fn，依次传入 整理后的结果 result。
               * @param response 异步请求返回的响应对象；使用 request 字段。
               * @returns {*} fn 回调的直接返回值。
               */
              (response) => {
                const { responseURL } = response.request;
                const playlist_id = getParameterByName('id', responseURL);
                result = {
                  type: 'playlist',
                  id: `qqplaylist_${playlist_id}`,
                };
                return fn(result);
              }
            )
            .catch(
              /**
               * 异步操作失败后，调用 fn，依次传入 undefined。
               * 无参数。
               * @returns {*} fn 回调的直接返回值。
               */
              () => fn(undefined)
            );
        }
        return fn(result);
      },
    };
  }

  /**
   * 按列表 ID 前缀路由QQ 音乐的歌单、专辑或歌手详情；不支持的前缀返回 null。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {*} 根据当前分支返回相应结果，可能的形式为 *、null。
   */
  static get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_')[0];
    switch (list_id) {
      case 'qqplaylist':
        return this.qq_get_playlist(url);
      case 'qqalbum':
        return this.qq_album(url);
      case 'qqartist':
        return this.qq_artist(url);
      case 'qqtoplist':
        return this.qq_toplist(url);
      default:
        return null;
    }
  }

  /**
   * 提供QQ 音乐的推荐分类与全部分类，通过 success 回调交出筛选结构。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_playlist_filters() {
    const target_url =
      'https://c.y.qq.com/splcloud/fcgi-bin/fcg_get_diss_tag_conf.fcg' +
      `?picmid=1&rnd=${Math.random()}&g_tk=732560869` +
      '&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8' +
      '&notice=0&platform=yqq.json&needNewCode=0';

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
             * 上一步异步操作完成后，调用 fn，依次传入 包含 recommend、all 的对象。
             * @param response 异步请求返回的响应对象。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response;
              const all = [];
              data.data.categories.forEach(
                /**
                 * 逐项处理 data.data.categories 中的条目，执行 cate.items.forEach。
                 * @param cate 来自 data.data.categories 的当前条目；使用 categoryGroupName、usable、items 字段。
                 * @returns {void} 无返回值。
                 */
                (cate) => {
                  const result = {
                    category: cate.categoryGroupName,
                    filters: [],
                  };
                  if (cate.usable === 1) {
                    cate.items.forEach(
                      /**
                       * 逐项处理 cate.items 中的条目，执行 result.filters.push。
                       * @param item 来自 cate.items 的当前条目；使用 categoryId、categoryName 字段。
                       * @returns {void} 无返回值。
                       */
                      (item) => {
                        result.filters.push({
                          id: item.categoryId,
                          name: this.htmlDecode(item.categoryName),
                        });
                      }
                    );
                    all.push(result);
                  }
                }
              );
              const recommendLimit = 8;
              const recommend = [
                { id: '', name: '全部' },
                { id: 'toplist', name: '排行榜' },
                ...all[1].filters.slice(0, recommendLimit),
              ];

              return fn({
                recommend,
                all,
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 按 QQ 用户标识查询资料并转换为统一用户数据。
   * @param uin QQ 用户标识。
   * @param callback 完成当前操作后调用的回调。
   * @returns {Promise<*>} 该异步链的 Promise。
   */
  static get_user_by_uin(uin, callback) {
    const infoUrl = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&&loginUin=${uin}&hostUin=0inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&data=${encodeURIComponent(
      JSON.stringify({
        comm: { ct: 24, cv: 0 },
        vip: {
          module: 'userInfo.VipQueryServer',
          method: 'SRFVipQuery_V2',
          param: { uin_list: [uin] },
        },
        base: {
          module: 'userInfo.BaseUserInfoServer',
          method: 'get_user_baseinfo_v2',
          param: { vec_uin: [uin] },
        },
      })
    )}`;

    return axios.get(infoUrl).then(
      /**
       * 上一步异步操作完成后，调用 callback，依次传入 包含 status、data 的对象。
       * @param response 异步请求返回的响应对象。
       * @returns {*} callback 回调的直接返回值。
       */
      (response) => {
        const { data } = response;
        const info = data.base.data.map_userinfo[uin];
        const result = {
          is_login: true,
          user_id: uin,
          user_name: uin,
          nickname: info.nick,
          avatar: info.headurl,
          platform: 'qq',
          data,
        };
        return callback({ status: 'success', data: result });
      }
    );
  }

  /**
   * 取得QQ 音乐用户创建的歌单。
   * @param url 携带 user_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_user_created_playlist(url) {
    const user_id = getParameterByName('user_id', url);
    // TODO：继续加载超过当前数量上限的项目。
    const size = 100;

    const target_url = `https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss?cv=4747474&ct=24&format=json&inCharset=utf-8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=1&uin=${user_id}&hostuin=${user_id}&sin=0&size=${size}`;

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
             * 上一步异步操作完成后，调用 fn，依次传入 包含 status、data 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const playlists = [];
              response.data.data.disslist.forEach(
                /**
                 * 逐项处理 response.data.data.disslist 中的条目，更新 playlist，执行 playlists.push。
                 * @param item 来自 response.data.data.disslist 的当前条目；使用 dir_show、tid、diss_name、diss_cover 字段。
                 * @returns {void} 无返回值。
                 */
                (item) => {
                  let playlist;
                  if (item.dir_show === 0) {
                    if (item.tid === 0) {
                      return;
                    }
                    if (item.diss_name === '我喜欢') {
                      playlist = {
                        cover_img_url:
                          'https://y.gtimg.cn/mediastyle/y/img/cover_love_300.jpg',
                        id: `qqplaylist_${item.tid}`,
                        source_url: `https://y.qq.com/n/ryqq/playlist/${item.tid}`,
                        title: item.diss_name,
                      };
                      playlists.push(playlist);
                    }
                  } else {
                    playlist = {
                      cover_img_url: item.diss_cover,
                      id: `qqplaylist_${item.tid}`,
                      source_url: `https://y.qq.com/n/ryqq/playlist/${item.tid}`,
                      title: item.diss_name,
                    };
                    playlists.push(playlist);
                  }
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
   * 取得QQ 音乐用户收藏的歌单。
   * @param url 携带 user_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_user_favorite_playlist(url) {
    const user_id = getParameterByName('user_id', url);
    // TODO：继续加载超过当前数量上限的项目。
    const size = 100;
    // https://github.com/jsososo/QQMusicApi/blob/master/routes/user.js
    const target_url = `https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg`;
    const data = {
      ct: 20,
      cid: 205360956,
      userid: user_id,
      reqtype: 3,
      sin: 0,
      ein: size,
    };
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
          .get(target_url, { params: data })
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 status、data 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const playlists = [];
              response.data.data.cdlist.forEach(
                /**
                 * 逐项处理 response.data.data.cdlist 中的条目，执行 playlists.push。
                 * @param item 来自 response.data.data.cdlist 的当前条目；使用 dir_show、logo、dissid、dissname 字段。
                 * @returns {void} 无返回值。
                 */
                (item) => {
                  if (item.dir_show === 0) {
                    return;
                  }
                  const playlist = {
                    cover_img_url: item.logo,
                    id: `qqplaylist_${item.dissid}`,
                    source_url: `https://y.qq.com/n/ryqq/playlist/${item.dissid}`,
                    title: item.dissname,
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
   * 取得QQ 音乐推荐给当前会话的歌单。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_recommend_playlist() {
    const target_url = `https://u.y.qq.com/cgi-bin/musicu.fcg?format=json&&loginUin=0&hostUin=0inCharset=utf8&outCharset=utf-8&platform=yqq.json&needNewCode=0&data=${encodeURIComponent(
      JSON.stringify({
        comm: {
          ct: 24,
        },
        recomPlaylist: {
          method: 'get_hot_recommend',
          param: {
            async: 1,
            cmd: 2,
          },
          module: 'playlist.HotRecommendServer',
        },
      })
    )}`;

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
             * 上一步异步操作完成后，调用 fn，依次传入 包含 status、data 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const playlists = [];
              response.data.recomPlaylist.data.v_hot.forEach(
                /**
                 * 逐项处理 response.data.recomPlaylist.data.v_hot 中的条目，执行 playlists.push。
                 * @param item 来自 response.data.recomPlaylist.data.v_hot 的当前条目；使用 cover、content_id、title 字段。
                 * @returns {void} 无返回值。
                 */
                (item) => {
                  const playlist = {
                    cover_img_url: item.cover,
                    id: `qqplaylist_${item.content_id}`,
                    source_url: `https://y.qq.com/n/ryqq/playlist/${item.content_id}`,
                    title: item.title,
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
   * 优先读取 uin，否则读取 wxuin，处理现有前缀规则后查询用户资料。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_user() {
    return {
      /**
       * 登记或执行旧式成功入口，执行 cookieGet；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success: (fn) => {
        const domain = 'https://y.qq.com';
        cookieGet(
          {
            url: domain,
            name: 'uin',
          },
          /**
           * 进入此回调后，执行 cookieGet。
           * @param qqCookie 读取到的 QQ uin Cookie，缺失时为空值。
           * @returns {*} cookieGet 的调用结果；其他分支返回 this.get_user_by_uin 的调用结果。
           */
          (qqCookie) => {
            if (qqCookie === null) {
              return cookieGet(
                {
                  url: domain,
                  name: 'wxuin',
                },
                /**
                 * 进入此回调后，更新 uin，调用 fn，依次传入 包含 status、data 的对象。
                 * @param wxCookie 读取到的 QQ wxuin Cookie，缺失时为空值。
                 * @returns {*} fn 回调的直接返回值；其他分支返回 this.get_user_by_uin 的调用结果。
                 */
                (wxCookie) => {
                  if (wxCookie == null) {
                    return fn({ status: 'fail', data: {} });
                  }
                  let { value: uin } = wxCookie;
                  uin = `1${uin.slice('o'.length)}`; // 按现有规则把前缀 o 替换为 1。
                  return this.get_user_by_uin(uin, fn);
                }
              );
            }
            const { value: uin } = qqCookie;
            return this.get_user_by_uin(uin, fn);
          }
        );
      },
    };
  }

  /**
   * 返回QQ 音乐登录入口地址。
   * 无参数。
   * @returns {string} 按当前字段拼接的字符串。
   */
  static get_login_url() {
    return `https://y.qq.com/portal/profile.html`;
  }

  /**
   * 清除QQ 音乐使用的认证 Cookie。
   * 无参数。
   * @returns {void} 无返回值。
   */
  static logout() {
    cookieRemove(
      {
        url: 'https://y.qq.com',
        name: 'uin',
      },
      /**
       * 进入此回调后，执行 cookieRemove。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        cookieRemove(
          {
            url: 'https://y.qq.com',
            name: 'wxuin',
          },
          /**
           * 保留的空回调，此处无需继续处理或改变状态。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {}
        );
      }
    );
  }
}
