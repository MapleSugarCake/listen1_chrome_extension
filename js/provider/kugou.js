/**
 * 文件职责：适配酷狗搜索、歌单、歌手、专辑与歌词接口，补全封面和曲目信息并解析可播放地址。
 *
 * 文件级定义：
 * - kugou：提供 kugou 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 * - kugou.kg_format_image_url：将接口图片模板中的尺寸占位符替换为 400。
 * - kugou.kg_decode_base64_utf8：解码 Base64 字节为 UTF-8 文本，并移除可能的字节顺序标记。
 * - kugou.kg_convert_song：将酷狗搜索歌曲字段转换为统一曲目结构。
 * - kugou.async_process_list：为每项建立按原索引命名的异步任务，并行处理后按输入顺序重组结果。
 * - kugou.kg_render_search_result_item：转换搜索项后补充封面，封面请求失败仍回传已成功转换的曲目。
 * - kugou.search：按查询参数搜索酷狗歌曲或歌单，通过旧 success 接口交出结果列表、总数和类型。
 * - kugou.kg_render_playlist_result_item：查询歌单曲目的详情并补充专辑名和图片，再交给索引回调。
 * - kugou.kg_get_playlist：读取酷狗歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
 * - kugou.kg_render_artist_result_item：拆分歌手歌曲文件名，补全专辑与图片后返回统一曲目。
 * - kugou.kg_artist：读取酷狗歌手资料与接口提供的歌曲列表，转换为统一列表详情。
 * - kugou.getTimestampString：返回当前毫秒时间戳的十进制字符串。
 * - kugou.getRandomIntString：生成随机数的数字字符序列，移除小数点等非数字字符。
 * - kugou.getRandomHexString：生成 16 位随机十六进制字符串，不用于安全随机数。
 * - kugou.bootstrap_track：把酷狗曲目解析为临时播放地址，通过 success 传出地址及来源信息。
 * - kugou.lyric：先查询歌词候选，再下载首项并解码。
 * - kugou.kg_render_album_result_item：结合专辑元信息转换歌曲，按需补全图片等字段。
 * - kugou.kg_album：读取酷狗专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
 * - kugou.show_playlist：按偏移和分类读取酷狗歌单列表，返回供调用方登记完成回调的对象。
 * - kugou.parse_url：识别酷狗分享链接并转换为内部列表 ID。
 * - kugou.get_playlist：按列表 ID 前缀路由酷狗的歌单、专辑或歌手详情。
 * - kugou.get_playlist_filters：当前没有提供筛选分类，通过回调返回空的 recommend 和 all 数组。
 * - kugou.get_user：当前没有实现用户资料查询，通过旧回调返回失败状态和空数据。
 * - kugou.get_login_url：返回酷狗登录入口地址。
 * - kugou.logout：保留退出入口。
 */
/* global RequestTask */
/* eslint-disable no-unused-vars */
/* global async getParameterByName */
/**
 * 提供 kugou 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 */
class kugou {
  /**
   * 将接口图片模板中的尺寸占位符替换为 400。
   * @param url 可能含 {size} 占位符的封面图片地址。
   * @returns {string} 替换尺寸后的图片 URL；输入为空时为空字符串。
   */
  static kg_format_image_url(url) {
    if (!url) {
      return '';
    }
    return url.replace('{size}', '400');
  }

  /**
   * 解码 Base64 字节为 UTF-8 文本，并移除可能的字节顺序标记。
   * @param content Base64 编码的 UTF-8 歌词内容。
   * @returns {string} 解码并去掉字节顺序标记的歌词；输入为空时为空字符串。
   */
  static kg_decode_base64_utf8(content) {
    if (!content) {
      return '';
    }

    const binary = window.atob(content);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return new window.TextDecoder('utf-8').decode(bytes).replace(/^\uFEFF/, '');
  }

  /**
   * 将酷狗搜索歌曲字段转换为统一曲目结构。
   * @param song 来源歌曲记录或当前页面曲目；使用 FileHash、SongName、AlbumName、AlbumID、Image、trans_param、SingerId、SingerName 字段。
   * @returns {Object} 统一曲目对象 track。
   */
  static kg_convert_song(song) {
    const track = {
      id: `kgtrack_${song.FileHash}`,
      title: song.SongName,
      artist: '',
      artist_id: '',
      album: song.AlbumName,
      album_id: `kgalbum_${song.AlbumID}`,
      source: 'kugou',
      source_url: `https://www.kugou.com/song/#hash=${song.FileHash}&album_id=${song.AlbumID}`,
      img_url: kugou.kg_format_image_url(
        song.Image || (song.trans_param && song.trans_param.union_cover)
      ),
      // 停用代码，保留供历史对照：
      // url: `kgtrack_${song.FileHash}`,
      lyric_url: song.FileHash,
    };
    let singer_id = song.SingerId;
    let singer_name = song.SingerName;
    if (song.SingerId instanceof Array) {
      [singer_id] = singer_id;
      [singer_name] = singer_name.split('、');
    }
    track.artist = singer_name;
    track.artist_id = `kgartist_${singer_id}`;
    return track;
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
   * 转换搜索项后补充封面，封面请求失败仍回传已成功转换的曲目。
   * @param index 当前条目的零起点索引；当前函数体未使用，保留调用签名。
   * @param item 当前遍历或处理的条目。
   * @param params 当前请求或操作参数；当前函数体未使用，保留调用签名。
   * @param callback 完成当前操作后调用的回调。
   * @returns {void} 无返回值。
   */
  static kg_render_search_result_item(index, item, params, callback) {
    const track = kugou.kg_convert_song(item);
    if (track.img_url) {
      callback(null, track);
      return;
    }

    const target_url = `${'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash='}${
      track.lyric_url
    }`;
    axios
      .get(target_url)
      .then(
        /**
         * 上一步异步操作完成后，更新 track.img_url，调用 callback，依次传入 null、统一曲目对象 track。
         * @param response 异步请求返回的响应对象。
         * @returns {void} 无返回值。
         */
        (response) => {
          const { data } = response;
          track.img_url = kugou.kg_format_image_url(
            data.album_img ||
              data.imgUrl ||
              (data.trans_param && data.trans_param.union_cover)
          );
          callback(null, track);
        }
      )
      .catch(
        /**
         * 异步操作失败后，调用 callback，依次传入 null、统一曲目对象 track。
         * 无参数。
         * @returns {*} callback 回调的直接返回值。
         */
        () => callback(null, track)
      );
  }

  /**
   * 按查询参数搜索酷狗歌曲或歌单，通过旧 success 接口交出结果列表、总数和类型。
   * @param url 携带 keywords、curpage、type 查询参数的内部请求地址。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static search(url, options = {}) {
    const request = RequestTask.http(options);
    const keyword = getParameterByName('keywords', url);
    const curpage = getParameterByName('curpage', url);
    const searchType = getParameterByName('type', url);
    if (searchType === '1') {
      return {
        /**
         * 登记或执行旧式成功入口，执行 request.get().then().catch；业务结果通过 fn 传出。
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
          const target_url = `${'http://mobilecdnbj.kugou.com/api/v3/search/special?keyword='}${keyword}&pagesize=20&filter=0&page=${curpage}`;
          request
            .get(target_url)
            .then(
              /**
               * 上一步异步操作完成后，调用 fn，依次传入 包含 result、total、type 的对象。
               * @param response 异步请求返回的响应对象；使用 data 字段。
               * @returns {*} fn 回调的直接返回值。
               */
              (response) => {
                const result = response.data.data.info.map(
                  /**
                   * 转换 response.data.data.info 中的条目，包含 id、title、source、source_url、img_url、url、author、count 的对象。
                   * @param item 来自 response.data.data.info 的当前条目；使用 specialid、specialname、imgurl、nickname、songcount 字段。
                   * @returns {Object} 包含 id、title、source、source_url、img_url、url、author、count 的对象。
                   */
                  (item) => ({
                    id: `kgplaylist_${item.specialid}`,
                    title: item.specialname,
                    source: 'kugou',
                    source_url:
                      'https://www.kugou.com/yy/special/single/{size}.html'.replace(
                        '{size}',
                        item.specialid
                      ),
                    img_url: item.imgurl
                      ? item.imgurl.replace('{size}', '400')
                      : '',
                    url: `kgplaylist_${item.specialid}`,
                    author: item.nickname,
                    count: item.songcount,
                  })
                );
                const { total } = response.data.data;
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
    return {
      /**
       * 登记或执行旧式成功入口，执行 request.get().then().catch；业务结果通过 fn 传出。
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
        const target_url = `${'https://songsearch.kugou.com/song_search_v2?keyword='}${keyword}&page=${curpage}`;
        request
          .get(target_url)
          .then(
            /**
             * 上一步异步操作完成后，执行 this.async_process_list。
             * @param response 异步请求返回的响应对象。
             * @returns {void} 无返回值。
             */
            (response) => {
              const { data } = response;
              this.async_process_list(
                data.data.lists,
                this.kg_render_search_result_item,
                [],
                /**
                 * 进入此回调后，调用 fn，依次传入 包含 result、total、type 的对象。
                 * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
                 * @param tracks 保持来源或调用方顺序的曲目数组。
                 * @returns {*} fn 回调的直接返回值。
                 */
                (err, tracks) =>
                  fn({
                    result: tracks,
                    total: data.data.total,
                    type: searchType,
                  })
              );
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 查询歌单曲目的详情并补充专辑名和图片，再交给索引回调。
   * @param index 当前条目的零起点索引；当前函数体未使用，保留调用签名。
   * @param item 当前遍历或处理的条目；使用 album_id 字段。
   * @param params 当前请求或操作参数；当前函数体未使用，保留调用签名。
   * @param callback 完成当前操作后调用的回调。
   * @returns {void} 无返回值。
   */
  static kg_render_playlist_result_item(index, item, params, callback) {
    const { hash } = item;

    let target_url = `${'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash='}${hash}`;
    const track = {
      id: `kgtrack_${hash}`,
      title: '',
      artist: '',
      artist_id: '',
      album: '',
      album_id: `kgalbum_${item.album_id}`,
      source: 'kugou',
      source_url: `https://www.kugou.com/song/#hash=${hash}&album_id=${item.album_id}`,
      img_url: '',
      lyric_url: hash,
    };
    // 补充歌曲详情。
    axios.get(target_url).then(
      /**
       * 上一步异步操作完成后，更新 track.title、track.artist、track.artist_id、track.img_url，执行 axios.get().then。
       * @param response 异步请求返回的响应对象。
       * @returns {void} 无返回值。
       */
      (response) => {
        const { data } = response;
        track.title = data.songName;
        track.artist = data.singerId === 0 ? '未知' : data.singerName;
        track.artist_id = `kgartist_${data.singerId}`;
        if (data.album_img !== undefined) {
          track.img_url = data.album_img.replace('{size}', '400');
        } else {
          // 停用代码，保留供历史对照：
          // track['img_url'] = data.imgUrl.replace('{size}', '400');
        }
        // 补充专辑信息。
        target_url = `http://mobilecdnbj.kugou.com/api/v3/album/info?albumid=${item.album_id}`;
        axios.get(target_url).then(
          /**
           * 上一步异步操作完成后，更新 track.album，调用 callback，依次传入 null、统一曲目对象 track。
           * @param res 异步响应或消息应答函数，按调用位置使用。
           * @returns {*} callback 回调的直接返回值。
           */
          (res) => {
            const { data: res_data } = res;
            if (
              res_data.status &&
              res_data.data !== undefined &&
              res_data.data !== null
            ) {
              track.album = res_data.data.albumname;
            } else {
              track.album = '';
            }
            return callback(null, track);
          }
        );
      }
    );
  }

  /**
   * 读取酷狗歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static kg_get_playlist(url) {
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
        const list_id = getParameterByName('list_id', url).split('_').pop();
        const target_url = `https://m.kugou.com/plist/list/${list_id}?json=true`;

        axios
          .get(target_url)
          .then(
            /**
             * 上一步异步操作完成后，执行 data.info.list.imgurl.replace（"{size}"）。
             * @param response 异步请求返回的响应对象。
             * @returns {void} 无返回值。
             */
            (response) => {
              const { data } = response;

              const info = {
                cover_img_url: data.info.list.imgurl
                  ? data.info.list.imgurl.replace('{size}', '400')
                  : '',
                title: data.info.list.specialname,
                id: `kgplaylist_${data.info.list.specialid}`,
                source_url:
                  'https://www.kugou.com/yy/special/single/{size}.html'.replace(
                    '{size}',
                    data.info.list.specialid
                  ),
              };

              this.async_process_list(
                data.list.list.info,
                this.kg_render_playlist_result_item,
                [],
                /**
                 * 进入此回调后，调用 fn，依次传入 包含 tracks、info 的对象。
                 * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
                 * @param tracks 保持来源或调用方顺序的曲目数组。
                 * @returns {*} fn 回调的直接返回值。
                 */
                (err, tracks) =>
                  fn({
                    tracks,
                    info,
                  })
              );
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 拆分歌手歌曲文件名，补全专辑与图片后返回统一曲目。
   * @param index 当前条目的零起点索引；当前函数体未使用，保留调用签名。
   * @param item 当前遍历或处理的条目；使用 hash、album_id、filename 字段。
   * @param params 当前请求或操作参数。
   * @param callback 完成当前操作后调用的回调。
   * @returns {void} 无返回值。
   */
  static kg_render_artist_result_item(index, item, params, callback) {
    const info = params[0];
    const track = {
      id: `kgtrack_${item.hash}`,
      title: '',
      artist: '',
      artist_id: info.id,
      album: '',
      album_id: `kgalbum_${item.album_id}`,
      source: 'kugou',
      source_url: `https://www.kugou.com/song/#hash=${item.hash}&album_id=${item.album_id}`,
      img_url: '',
      // 停用代码，保留供历史对照：
      // url: `kgtrack_${item.hash}`,
      lyric_url: item.hash,
    };
    const one = item.filename.split('-');
    track.title = one[1].trim();
    track.artist = one[0].trim();
    // 补充专辑名称和封面。
    const target_url = `${'https://www.kugou.com/yy/index.php?r=play/getdata&hash='}${
      item.hash
    }`;
    axios
      .get(
        `http://mobilecdnbj.kugou.com/api/v3/album/info?albumid=${item.album_id}`
      )
      .then(
        /**
         * 上一步异步操作完成后，更新 track.album，执行 axios.get().then。
         * @param response 异步请求返回的响应对象。
         * @returns {void} 无返回值。
         */
        (response) => {
          const { data } = response;
          if (data.status && data.data !== undefined) {
            track.album = data.data.albumname;
          } else {
            track.album = '';
          }
          axios.get(target_url).then(
            /**
             * 上一步异步操作完成后，更新 track.img_url，调用 callback，依次传入 null、统一曲目对象 track。
             * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
             * @returns {void} 无返回值。
             */
            (res) => {
              track.img_url = res.data.data.img;
              callback(null, track);
            }
          );
        }
      );
  }

  /**
   * 读取酷狗歌手资料与接口提供的歌曲列表，转换为统一列表详情。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static kg_artist(url) {
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
        const artist_id = getParameterByName('list_id', url).split('_').pop();
        let target_url = `http://mobilecdnbj.kugou.com/api/v3/singer/info?singerid=${artist_id}`;
        axios
          .get(target_url)
          .then(
            /**
             * 上一步异步操作完成后，更新 target_url，执行 axios.get().then().catch。
             * @param response 异步请求返回的响应对象。
             * @returns {void} 无返回值。
             */
            (response) => {
              const { data } = response;
              const info = {
                cover_img_url: data.data.imgurl.replace('{size}', '400'),
                title: data.data.singername,
                id: `kgartist_${artist_id}`,
                source_url: 'https://www.kugou.com/singer/{id}.html'.replace(
                  '{id}',
                  artist_id
                ),
              };
              target_url = `http://mobilecdnbj.kugou.com/api/v3/singer/song?singerid=${artist_id}&page=1&pagesize=30`;
              axios
                .get(target_url)
                .then(
                  /**
                   * 上一步异步操作完成后，执行 this.async_process_list。
                   * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
                   * @returns {void} 无返回值。
                   */
                  (res) => {
                    this.async_process_list(
                      res.data.data.info,
                      this.kg_render_artist_result_item,
                      [info],
                      /**
                       * 进入此回调后，调用 fn，依次传入 包含 tracks、info 的对象。
                       * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
                       * @param tracks 保持来源或调用方顺序的曲目数组。
                       * @returns {*} fn 回调的直接返回值。
                       */
                      (err, tracks) =>
                        fn({
                          tracks,
                          info,
                        })
                    );
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
   * 返回当前毫秒时间戳的十进制字符串。
   * 无参数。
   * @returns {string} new Date().getTime().toString 的调用结果。
   */
  static getTimestampString() {
    return new Date().getTime().toString();
  }

  /**
   * 生成随机数的数字字符序列，移除小数点等非数字字符。
   * 无参数。
   * @returns {string} Math.random() * 100.toString().replace 的调用结果。
   */
  static getRandomIntString() {
    return (Math.random() * 100).toString().replace(/\D/g, '');
  }

  /**
   * 生成 16 位随机十六进制字符串，不用于安全随机数。
   * 无参数。
   * @returns {string} 整理后的结果 result。
   */
  static getRandomHexString() {
    let result = '';
    const letters = '0123456789abcdef';
    for (let i = 0; i < 16; i += 1) {
      result += letters[Math.floor(Math.random() * 16)];
    }
    return result;
  }

  /**
   * 把酷狗曲目解析为临时播放地址，通过 success 传出地址及来源信息；不可用或请求失败时调用 failure。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 id 字段。
   * @param success 接收成功业务结果的回调。
   * @param failure 接收失败原因的回调；省略时沿用声明中的默认处理。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {void} 无返回值。
   */
  static bootstrap_track(track, success, failure, options = {}) {
    const request = RequestTask.http(options);
    const track_id = track.id.slice('kgtrack_'.length);

    const target_url = `https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash=${track_id}`;

    request
      .get(target_url)
      .then(
        /**
         * 上一步异步操作完成后，调用 failure，依次传入 空对象。
         * @param response 异步请求返回的响应对象。
         * @returns {*} failure 回调的直接返回值；其他分支返回 success 回调的直接返回值。
         */
        (response) => {
          const { data: info } = response;

          const { url } = info;

          if (url === '') {
            return failure({});
          }

          return success({
            url,
            bitrate: `${info.bitRate}kbps`,
            platform: 'kugou',
          });
        }
      )
      .catch(failure);
  }

  /**
   * 先查询歌词候选，再下载首项并解码；没有可用候选或请求失败时回传空歌词。
   * @param url 携带 track_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lyric(url) {
    const track_id = getParameterByName('track_id', url).split('_').pop();
    const search_url = `https://lyrics.kugou.com/search?ver=1&man=yes&client=pc&hash=${track_id}`;
    return {
      /**
       * 登记或执行旧式成功入口，执行 axios.get().then().then().catch；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success: (fn) => {
        axios
          .get(search_url)
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 lyric 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {*} null；其他分支返回 axios.get 的调用结果。
             */
            (response) => {
              const candidates = response.data.candidates || [];
              if (candidates.length === 0) {
                fn({ lyric: '' });
                return null;
              }

              const candidate = candidates[0];
              const download_url = `${'https://lyrics.kugou.com/download?ver=1&client=pc&fmt=lrc&charset=utf8'}&id=${candidate.id}&accesskey=${candidate.accesskey}`;
              return axios.get(download_url);
            }
          )
          .then(
            /**
             * 上一步异步操作完成后，调用 fn，依次传入 包含 lyric 的对象。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {void} 无返回值。
             */
            (response) => {
              if (!response) {
                return;
              }

              fn({
                lyric: kugou.kg_decode_base64_utf8(response.data.content),
              });
            }
          )
          .catch(
            /**
             * 异步操作失败后，调用 fn，依次传入 包含 lyric 的对象。
             * 无参数。
             * @returns {*} fn 回调的直接返回值。
             */
            () => fn({ lyric: '' })
          );
      },
    };
  }

  /**
   * 结合专辑元信息转换歌曲，按需补全图片等字段。
   * @param index 当前条目的零起点索引；当前函数体未使用，保留调用签名。
   * @param item 当前遍历或处理的条目；使用 hash 字段。
   * @param params 当前请求或操作参数。
   * @param callback 完成当前操作后调用的回调。
   * @returns {void} 无返回值。
   */
  static kg_render_album_result_item(index, item, params, callback) {
    const info = params[0];
    const album_id = params[1];
    const track = {
      id: `kgtrack_${item.hash}`,
      title: '',
      artist: '',
      artist_id: '',
      album: info.title,
      album_id: `kgalbum_${album_id}`,
      source: 'kugou',
      source_url: `https://www.kugou.com/song/#hash=${item.hash}&album_id=${album_id}`,
      img_url: '',
      // 停用代码，保留供历史对照：
      // url: `xmtrack_${item.hash}`,
      lyric_url: item.hash,
    };
    // 补充其余曲目字段。
    const target_url = `${'https://m.kugou.com/app/i/getSongInfo.php?cmd=playInfo&hash='}${
      item.hash
    }`;
    axios.get(target_url).then(
      /**
       * 上一步异步操作完成后，更新 track.title、track.artist、track.artist_id、track.img_url，调用 callback，依次传入 null、统一曲目对象 track。
       * @param response 异步请求返回的响应对象。
       * @returns {void} 无返回值。
       */
      (response) => {
        const { data } = response;
        track.title = data.songName;
        track.artist = data.singerId === 0 ? '未知' : data.singerName;
        track.artist_id = `kgartist_${data.singerId}`;
        track.img_url = data.imgUrl.replace('{size}', '400');
        callback(null, track);
      }
    );
  }

  /**
   * 读取酷狗专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static kg_album(url) {
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
        const album_id = getParameterByName('list_id', url).split('_').pop();
        let target_url = `${'http://mobilecdnbj.kugou.com/api/v3/album/info?albumid='}${album_id}`;

        let info;
        // 榜单元信息。
        axios
          .get(target_url)
          .then(
            /**
             * 上一步异步操作完成后，更新 info、target_url，执行 axios.get().then().catch。
             * @param response 异步请求返回的响应对象。
             * @returns {void} 无返回值。
             */
            (response) => {
              const { data } = response;

              info = {
                cover_img_url: data.data.imgurl.replace('{size}', '400'),
                title: data.data.albumname,
                id: `kgalbum_${data.data.albumid}`,
                source_url: 'https://www.kugou.com/album/{id}.html'.replace(
                  '{id}',
                  data.data.albumid
                ),
              };

              target_url = `${'http://mobilecdnbj.kugou.com/api/v3/album/song?albumid='}${album_id}&page=1&pagesize=-1`;
              axios
                .get(target_url)
                .then(
                  /**
                   * 上一步异步操作完成后，执行 this.async_process_list。
                   * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
                   * @returns {void} 无返回值。
                   */
                  (res) => {
                    this.async_process_list(
                      res.data.data.info,
                      this.kg_render_album_result_item,
                      [info, album_id],
                      /**
                       * 进入此回调后，调用 fn，依次传入 包含 tracks、info 的对象。
                       * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
                       * @param tracks 保持来源或调用方顺序的曲目数组。
                       * @returns {*} fn 回调的直接返回值。
                       */
                      (err, tracks) =>
                        fn({
                          tracks,
                          info,
                        })
                    );
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
   * 按偏移和分类读取酷狗歌单列表，返回供调用方登记完成回调的对象。
   * @param url 携带 offset 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static show_playlist(url) {
    let offset = getParameterByName('offset', url);
    if (offset === undefined) {
      offset = 0;
    }
    const page = offset / 30 + 1;
    const target_url = `${'https://m.kugou.com/plist/index&json=true&page='}${page}`;
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
              // 停用代码，保留供历史对照：
              // const total = data.plist.total;
              const result = data.plist.list.info.map(
                /**
                 * 转换 data.plist.list.info 中的条目，包含 cover_img_url、title、id、source_url 的对象。
                 * @param item 来自 data.plist.list.info 的当前条目；使用 imgurl、specialname、specialid 字段。
                 * @returns {Object} 包含 cover_img_url、title、id、source_url 的对象。
                 */
                (item) => ({
                  cover_img_url: item.imgurl
                    ? item.imgurl.replace('{size}', '400')
                    : '',
                  title: item.specialname,
                  id: `kgplaylist_${item.specialid}`,
                  source_url:
                    'https://www.kugou.com/yy/special/single/{size}.html'.replace(
                      '{size}',
                      item.specialid
                    ),
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
   * 识别酷狗分享链接并转换为内部列表 ID；通过 success 回调交出匹配结果，无匹配时为 undefined。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static parse_url(url) {
    let result;
    const match = /\/\/www.kugou.com\/yy\/special\/single\/([0-9]+).html/.exec(
      url
    );
    if (match != null) {
      const playlist_id = match[1];
      result = {
        type: 'playlist',
        id: `kgplaylist_${playlist_id}`,
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
   * 按列表 ID 前缀路由酷狗的歌单、专辑或歌手详情；不支持的前缀返回 null。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {*} this.kg_get_playlist 的调用结果；其他分支返回 this.kg_album 的调用结果；其他分支返回 this.kg_artist 的调用结果；其他分支返回 null。
   */
  static get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_')[0];
    switch (list_id) {
      case 'kgplaylist':
        return this.kg_get_playlist(url);
      case 'kgalbum':
        return this.kg_album(url);
      case 'kgartist':
        return this.kg_artist(url);
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
   * 返回酷狗登录入口地址。
   * 无参数。
   * @returns {string} 按当前字段拼接的字符串。
   */
  static get_login_url() {
    return `https://www.kugou.com`;
  }

  /**
   * 保留退出入口；当前函数体为空，不修改认证状态。
   * 无参数。
   * @returns {void} 无返回值。
   */
  static logout() {}

  // 停用代码，保留供历史对照：
  // return {
  //   show_playlist: kg_show_playlist,
  //   get_playlist_filters,
  //   get_playlist,
  //   parse_url: kg_parse_url,
  //   bootstrap_track: kg_bootstrap_track,
  //   search: kg_search,
  //   lyric: kg_lyric,
  //   get_user: kg_get_user,
  //   get_login_url: kg_get_login_url,
  //   logout: kg_logout,
  // };
}
