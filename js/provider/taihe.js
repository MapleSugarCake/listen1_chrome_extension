/**
 * 文件职责：适配太合音乐接口，通过时间戳与签名请求歌单、搜索、专辑、歌手、歌词和播放地址。
 *
 * 文件级定义：
 * - axiosTH：以太合接口为基址并安装同步签名拦截器的 Axios 实例。
 * - taihe：提供 taihe 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 * - taihe.th_convert_song：将太合歌曲转换为统一曲目，歌手字段缺失时保留可用的其他元信息。
 * - taihe.th_render_tracks：按每页 100 首读取歌单曲目，转换后通过异步库回调交出。
 * - taihe.search：查询歌曲并转换结果。
 * - taihe.th_get_playlist：读取太合音乐歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
 * - taihe.th_artist：读取太合音乐歌手资料与接口提供的歌曲列表，转换为统一列表详情。
 * - taihe.bootstrap_track：把太合音乐曲目解析为临时播放地址，通过 success 传出地址及来源信息。
 * - taihe.lyric：优先使用传入的歌词 URL，否则查询曲目详情中的歌词地址再下载文本。
 * - taihe.th_album：读取太合音乐专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
 * - taihe.show_playlist：按偏移和分类读取太合音乐歌单列表，返回供调用方登记完成回调的对象。
 * - taihe.parse_url：识别太合音乐分享链接并转换为内部列表 ID。
 * - taihe.get_playlist：按列表 ID 前缀路由太合音乐的歌单、专辑或歌手详情。
 * - taihe.get_playlist_filters：提供太合音乐的推荐分类与全部分类，通过 success 回调交出筛选结构。
 * - taihe.get_user：当前没有实现用户资料查询，通过旧回调返回失败状态和空数据。
 * - taihe.get_login_url：返回太合音乐登录入口地址。
 * - taihe.logout：保留退出入口。
 */
/* eslint-disable no-unused-vars */
/* global async getParameterByName forge */
/**
 * axiosTH：以太合接口为基址并安装同步签名拦截器的 Axios 实例；类型为 import("axios").AxiosInstance。
 * @type {import("axios").AxiosInstance}
 */
const axiosTH = axios.create({
  baseURL: 'https://music.taihe.com/v1',
});
axiosTH.interceptors.request.use(
  /**
   * 进入此回调后，更新 params.timestamp、params.appid、params.sign，执行 Math.round。
   * @param config 本次请求或设置的配置对象；使用 params 字段。
   * @returns {Object} 包含 展开字段、params 的对象。
   */
  (config) => {
    const params = { ...config.params };
    params.timestamp = Math.round(Date.now() / 1000);
    params.appid = '16073360';
    const q = new URLSearchParams(params);
    q.sort();
    const signStr = decodeURIComponent(
      `${q.toString()}0b50b02fd0d73a9c4c8c3a781c30845f`
    );
    params.sign = forge.md5
      .create()
      .update(forge.util.encodeUtf8(signStr))
      .digest()
      .toHex();

    return { ...config, params };
  },
  null,
  { synchronous: true }
);

/**
 * 提供 taihe 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 */
class taihe {
  /**
   * 将太合歌曲转换为统一曲目，歌手字段缺失时保留可用的其他元信息。
   * @param song 来源歌曲记录或当前页面曲目；使用 id、title、albumTitle、albumAssetCode、pic、lyric、artist 字段。
   * @returns {Object} 统一曲目对象 track。
   */
  static th_convert_song(song) {
    const track = {
      id: `thtrack_${song.id}`,
      title: song.title,
      album: song.albumTitle,
      album_id: `thalbum_${song.albumAssetCode}`,
      source: 'taihe',
      source_url: `https://music.taihe.com/song/${song.id}`,
      img_url: song.pic,
      lyric_url: song.lyric || '',
    };
    if (song.artist && song.artist.length) {
      track.artist = song.artist[0].name;
      track.artist_id = `thartist_${song.artist[0].artistCode}`;
    }
    return track;
  }

  /**
   * 按每页 100 首读取歌单曲目，转换后通过异步库回调交出。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @param page 页面对象或从 1 开始的来源页码，按当前调用位置使用。
   * @param callback 完成当前操作后调用的回调。
   * @returns {void} 无返回值。
   */
  static th_render_tracks(url, page, callback) {
    const list_id = getParameterByName('list_id', url).split('_').pop();
    axiosTH
      .get('/tracklist/info', {
        params: {
          id: list_id,
          pageNo: page,
          pageSize: 100,
        },
      })
      .then(
        /**
         * 上一步异步操作完成后，调用 callback，依次传入 null、曲目数组 tracks。
         * @param response 异步请求返回的响应对象；使用 data 字段。
         * @returns {*} callback 回调的直接返回值。
         */
        (response) => {
          const data = response.data.data.trackList;
          const tracks = data.map(this.th_convert_song);
          return callback(null, tracks);
        }
      );
  }

  /**
   * 查询歌曲并转换结果；歌单搜索目前直接返回空列表。
   * @param url 携带 keywords、curpage、type 查询参数的内部请求地址。
   * @param [options] 本次操作选项；当前函数体未使用，保留调用签名；默认值为 空对象。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static search(url, options = {}) {
    const keyword = getParameterByName('keywords', url);
    const curpage = getParameterByName('curpage', url);
    const searchType = getParameterByName('type', url);
    if (searchType === '1') {
      return {
        /**
         * 登记或执行旧式成功入口，调用 fn，依次传入 包含 result、total、type 的对象；业务结果通过 fn 传出。
         * @param fn 接收处理结果的回调函数。
         * @returns {*} fn 回调的直接返回值。
         */
        success: (fn) =>
          fn({
            result: [],
            total: 0,
            type: searchType,
          }),
      };
    }
    return {
      /**
       * 登记或执行旧式成功入口，执行 axiosTH.get().then().catch；业务结果通过 fn 传出。
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
        axiosTH
          .get('/search', {
            params: {
              word: keyword,
              pageNo: curpage || 1,
              type: 1,
            },
          })
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 result、total、type 的对象。
             * @param res 异步响应或消息应答函数，按调用位置使用。
             * @returns {*} fn 回调的直接返回值。
             */
            (res) => {
              const { data } = res;
              const tracks = data.data.typeTrack.map(this.th_convert_song);
              return fn({
                result: tracks,
                total: data.data.total,
                type: searchType,
              });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 读取太合音乐歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static th_get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_').pop();

    return {
      /**
       * 登记或执行旧式成功入口，执行 axiosTH.get().then().catch；业务结果通过 fn 传出。
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
        axiosTH
          .get('/tracklist/info', {
            params: {
              id: list_id,
            },
          })
          .then(
            /**
             * 上一步异步操作完成后，执行 Math.ceil。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {void} 无返回值。
             */
            (response) => {
              const { data } = response.data;

              const info = {
                cover_img_url: data.pic,
                title: data.title,
                id: `thplaylist_${list_id}`,
                source_url: `https://music.taihe.com/songlist/${list_id}`,
              };

              const total = data.trackCount;
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
                 * 进入此回调后，执行 this.th_render_tracks。
                 * @param item 当前遍历或处理的条目。
                 * @param callback 完成当前操作后调用的回调。
                 * @returns {*} this.th_render_tracks 的调用结果。
                 */
                (item, callback) => this.th_render_tracks(url, item, callback),
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
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 读取太合音乐歌手资料与接口提供的歌曲列表，转换为统一列表详情。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static th_artist(url) {
    return {
      /**
       * 登记或执行旧式成功入口，执行 axiosTH.get().then().catch；业务结果通过 fn 传出。
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
        const artist_id = getParameterByName('list_id', url).split('_').pop();
        axiosTH
          .get('/artist/info', {
            params: {
              artistCode: artist_id,
            },
          })
          .then(
            /**
             * 上一步异步操作完成后，执行 axiosTH.get().then().catch。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {void} 无返回值。
             */
            (response) => {
              const info = {
                cover_img_url: response.data.data.pic,
                title: response.data.data.name,
                id: `thartist_${artist_id}`,
                source_url: `https://music.taihe.com/artist/${artist_id}`,
              };
              axiosTH
                .get('/artist/song', {
                  params: {
                    artistCode: artist_id,
                    pageNo: 1,
                    pageSize: 50,
                  },
                })
                .then(
                  /**
                   * 上一步异步操作完成后，调用 fn，依次传入 包含 tracks、info 的对象。
                   * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
                   * @returns {*} fn 回调的直接返回值。
                   */
                  (res) => {
                    const tracks = res.data.data.result.map(
                      this.th_convert_song
                    );
                    return fn({
                      tracks,
                      info,
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
   * 把太合音乐曲目解析为临时播放地址，通过 success 传出地址及来源信息；不可用或请求失败时调用 failure。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 id 字段。
   * @param success 接收成功业务结果的回调。
   * @param failure 接收失败原因的回调；省略时沿用声明中的默认处理。
   * @param [options] 本次操作选项；当前函数体未使用，保留调用签名；默认值为 空对象。
   * @returns {void} 无返回值。
   */
  static bootstrap_track(track, success, failure, options = {}) {
    const sound = {};
    const song_id = track.id.slice('thtrack_'.length);
    axiosTH
      .get('/song/tracklink', {
        params: {
          TSID: song_id,
        },
      })
      .then(
        /**
         * 上一步异步操作完成后，更新 sound.url、sound.platform、sound.bitrate，调用 success，依次传入 播放地址对象 sound。
         * @param response 异步请求返回的响应对象。
         * @returns {void} 无返回值。
         */
        (response) => {
          const { data } = response;
          if (data.data && data.data.path) {
            sound.url = data.data.path;
            sound.platform = 'taihe';
            sound.bitrate = `${data.data.rate}kbps`;

            success(sound);
          } else {
            failure(sound);
          }
        }
      )
      .catch(failure);
  }

  /**
   * 优先使用传入的歌词 URL，否则查询曲目详情中的歌词地址再下载文本。
   * @param url 携带 lyric_url、track_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lyric(url) {
    const lyric_url = getParameterByName('lyric_url', url);

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
        if (lyric_url) {
          axios
            .get(lyric_url)
            .then(
              /**
               * 上一步异步操作完成后，调用 fn，依次传入 包含 lyric 的对象。
               * @param response 异步请求返回的响应对象；使用 data 字段。
               * @returns {*} fn 回调的直接返回值。
               */
              (response) =>
                fn({
                  lyric: response.data,
                })
            )
            .catch(failure);
        } else {
          const track_id = getParameterByName('track_id', url).split('_').pop();
          axiosTH
            .get('/song/tracklink', {
              params: {
                TSID: track_id,
              },
            })
            .then(
              /**
               * 上一步异步操作完成后，执行 axios.get().then().catch。
               * @param response 异步请求返回的响应对象；使用 data 字段。
               * @returns {void} 无返回值。
               */
              (response) => {
                axios
                  .get(response.data.data.lyric)
                  .then(
                    /**
                     * 上一步异步操作完成后，调用 fn，依次传入 包含 lyric 的对象。
                     * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
                     * @returns {*} fn 回调的直接返回值。
                     */
                    (res) =>
                      fn({
                        lyric: res.data,
                      })
                  )
                  .catch(failure);
              }
            )
            .catch(failure);
        }
      },
    };
  }

  /**
   * 读取太合音乐专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static th_album(url) {
    return {
      /**
       * 登记或执行旧式成功入口，执行 axiosTH.get().then().catch；业务结果通过 fn 传出。
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
        const album_id = getParameterByName('list_id', url).split('_').pop();

        axiosTH
          .get('/album/info', {
            params: {
              albumAssetCode: album_id,
            },
          })
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 tracks、info 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response.data;
              const info = {
                cover_img_url: data.pic,
                title: data.title,
                id: `thalbum_${album_id}`,
                source_url: `https://music.taihe.com/album/${album_id}`,
              };

              const tracks = data.trackList.map(
                /**
                 * 转换 data.trackList 中的条目，包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、lyric_url 的对象。
                 * @param song 来自 data.trackList 的当前条目；使用 assetId、title、artist 字段。
                 * @returns {Object} 包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、lyric_url 的对象。
                 */
                (song) => ({
                  id: `thtrack_${song.assetId}`,
                  title: song.title,
                  artist: song.artist ? song.artist[0].name : '',
                  artist_id: song.artist
                    ? `thartist_${song.artist[0].artistCode}`
                    : 'thartist_',
                  album: info.title,
                  album_id: `thalbum_${album_id}`,
                  source: 'taihe',
                  source_url: `https://music.taihe.com/song/${song.assetId}`,
                  img_url: info.cover_img_url,
                  lyric_url: '',
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
   * 按偏移和分类读取太合音乐歌单列表，返回供调用方登记完成回调的对象。
   * @param url 携带 offset、filter_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static show_playlist(url) {
    const offset = Number(getParameterByName('offset', url));
    const subCate = getParameterByName('filter_id', url);
    return {
      /**
       * 登记或执行旧式成功入口，执行 axiosTH.get().then().catch；业务结果通过 fn 传出。
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
        axiosTH
          .get('/tracklist/list', {
            params: {
              pageNo: offset / 25 + 1,
              pageSize: 25,
              subCateId: subCate,
            },
          })
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 result 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response.data;
              const result = data.result.map(
                /**
                 * 转换 data.result 中的条目，包含 cover_img_url、title、id、source_url 的对象。
                 * @param item 来自 data.result 的当前条目；使用 pic、title、id 字段。
                 * @returns {Object} 包含 cover_img_url、title、id、source_url 的对象。
                 */
                (item) => ({
                  cover_img_url: item.pic,
                  title: item.title,
                  id: `thplaylist_${item.id}`,
                  source_url: `https://music.taihe.com/songlist/${item.id}`,
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
   * 识别太合音乐分享链接并转换为内部列表 ID；通过 success 回调交出匹配结果，无匹配时为 undefined。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static parse_url(url) {
    let result;
    let id = '';
    let match = /\/\/music.taihe.com\/([a-z]+)\//.exec(url);
    if (match) {
      switch (match[1]) {
        case 'songlist':
          match = /\/\/music.taihe.com\/songlist\/([0-9]+)/.exec(url);
          id = match ? `thplaylist_${match[1]}` : '';
          break;
        case 'artist':
          match = /\/\/music.taihe.com\/artist\/(A[0-9]+)/.exec(url);
          id = match ? `thartist_${match[1]}` : '';
          break;
        case 'album':
          match = /\/\/music.taihe.com\/album\/(P[0-9]+)/.exec(url);
          id = match ? `thalbum_${match[1]}` : '';
          break;
        default:
          break;
      }
      result = {
        type: 'playlist',
        id,
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
   * 按列表 ID 前缀路由太合音乐的歌单、专辑或歌手详情；不支持的前缀返回 null。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {*} this.th_get_playlist 的调用结果；其他分支返回 this.th_album 的调用结果；其他分支返回 this.th_artist 的调用结果；其他分支返回 null。
   */
  static get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_')[0];
    switch (list_id) {
      case 'thplaylist':
        return this.th_get_playlist(url);
      case 'thalbum':
        return this.th_album(url);
      case 'thartist':
        return this.th_artist(url);
      default:
        return null;
    }
  }

  /**
   * 提供太合音乐的推荐分类与全部分类，通过 success 回调交出筛选结构。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_playlist_filters() {
    return {
      /**
       * 登记或执行旧式成功入口，执行 axiosTH.get().then().catch；业务结果通过 fn 传出。
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
        axiosTH
          .get('/tracklist/category')
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 recommend、all 的对象。
             * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (res) =>
              fn({
                recommend: [{ id: '', name: '推荐歌单' }],
                all: res.data.data.map(
                  /**
                   * 转换 res.data.data 中的条目，包含 category、filters 的对象。
                   * @param sub 来自 res.data.data 的当前条目；使用 categoryName、subCate 字段。
                   * @returns {Object} 包含 category、filters 的对象。
                   */
                  (sub) => ({
                    category: sub.categoryName,
                    filters: sub.subCate.map(
                      /**
                       * 转换 sub.subCate 中的条目，包含 id、name 的对象。
                       * @param i 来自 sub.subCate 的当前条目；使用 id、categoryName 字段。
                       * @returns {Object} 包含 id、name 的对象。
                       */
                      (i) => ({
                        id: i.id,
                        name: i.categoryName,
                      })
                    ),
                  })
                ),
              })
          )
          .catch(failure);
      },
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
   * 返回太合音乐登录入口地址。
   * 无参数。
   * @returns {string} 按当前字段拼接的字符串。
   */
  static get_login_url() {
    return `https://music.taihe.com`;
  }

  /**
   * 保留退出入口；当前函数体为空，不修改认证状态。
   * 无参数。
   * @returns {void} 无返回值。
   */
  static logout() {}
}
