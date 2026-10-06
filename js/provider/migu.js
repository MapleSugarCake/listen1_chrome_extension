/**
 * 文件职责：适配咪咕的多种歌曲结构、分页列表、原文及翻译歌词和播放音质参数，保留停用接口供历史对照。
 *
 * 文件级定义：
 * - migu：提供 migu 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 * - migu.mg_convert_song：将旧咪咕歌曲字段转换为统一结构，保留歌词地址与音质标记。
 * - migu.mg_convert_song2：将新版咪咕歌曲字段转换为统一结构，保留播放解析所需的内容 ID。
 * - migu.mg_render_tracks：根据歌单或专辑类型请求每页 50 首曲目，转换后通过回调交出。
 * - migu.mg_show_toplist：读取咪咕榜单目录。
 * - migu.show_playlist：按偏移和分类读取咪咕歌单列表，返回供调用方登记完成回调的对象。
 * - migu.mg_toplist：根据本地榜单映射获取网页数据，从内嵌歌曲数据解析榜单曲目。
 * - migu.mg_get_playlist：读取歌单总数并以每页 50 首遍历所有页，合并元信息和曲目。
 * - migu.mg_album：读取专辑总数并以每页 50 首遍历所有页，合并曲目。
 * - migu.mg_artist：读取咪咕歌手资料与接口提供的歌曲列表，转换为统一列表详情。
 * - migu.bootstrap_track：根据曲目音质选择 toneFlag，请求播放地址并规范化转义字符，回传平台及码率。
 * - migu.search：按每页 20 项请求搜索，歌曲接口缺少可靠总数时返回 null。
 * - migu.uuid：借助临时 Blob URL 提取唯一标识，并立即撤销 URL 释放资源。
 * - migu.lyric：读取咪咕原文和可用的译文歌词，沿用 lyric／tlyric 响应字段。
 * - migu.mg_generate_translation：移除译文与原文重复的标题和作者等元信息，保留歌词时间线后返回双语结果。
 * - migu.parse_url：识别咪咕分享链接并转换为内部列表 ID。
 * - migu.get_playlist：按列表 ID 前缀路由咪咕的歌单、专辑或歌手详情。
 * - migu.get_playlist_filters：提供咪咕的推荐分类与全部分类，通过 success 回调交出筛选结构。
 * - migu.get_user：读取咪咕当前登录用户，按统一 status 和 data 结构回传结果。
 * - migu.get_login_url：返回咪咕登录入口地址。
 * - migu.logout：清除咪咕使用的认证 Cookie。
 */
/* global RequestTask */
/* eslint-disable consistent-return */
/* eslint-disable no-unused-vars */

/* global getParameterByName cookieRemove async forge */
/**
 * 提供 migu 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 */
class migu {
  /**
   * 将旧咪咕歌曲字段转换为统一结构，保留歌词地址与音质标记。
   * @param song 来源歌曲记录或当前页面曲目。
   * @returns {Object} 包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、lyric_url、tlyric_url、quality、url、song_id、content_id 的对象。
   */
  static mg_convert_song(song) {
    return {
      id: `mgtrack_${song.copyrightId}`,
      title: song.songName,
      artist: song.artists ? song.artists[0].name : song.singer,
      artist_id: `mgartist_${
        song.artists ? song.artists[0].id : song.singerId
      }`,
      album: song.albumId !== 1 ? song.album : '',
      album_id: song.albumId !== 1 ? `mgalbum_${song.albumId}` : 'mgalbum_',
      source: 'migu',
      source_url: `https://music.migu.cn/v3/music/song/${song.copyrightId}`,
      img_url: song.albumImgs[1].img,
      // 停用代码，保留供历史对照：
      // url: `mgtrack_${song.copyrightId}`,
      lyric_url: song.lrcUrl || '',
      tlyric_url: song.trcUrl || '',
      quality: song.toneControl,
      url: song.copyright === 0 ? '' : undefined,
      song_id: song.songId,
      content_id: song.contentId,
    };
  }

  /**
   * 将新版咪咕歌曲字段转换为统一结构，保留播放解析所需的内容 ID。
   * @param song 来源歌曲记录或当前页面曲目。
   * @returns {Object} 包含 id、title、artist、artist_id、album、album_id、source、source_url、img_url、lyric_url、tlyric_url、quality、url、song_id、content_id 的对象。
   */
  static mg_convert_song2(song) {
    return {
      id: `mgtrack_${song.copyrightId}`,
      title: song.songName,
      artist: song.singerList ? song.singerList[0].name : song.singer,
      artist_id: `mgartist_${
        song.singerList ? song.singerList[0].id : song.singerId
      }`,
      album: song.albumId !== 1 ? song.album : '',
      album_id: song.albumId !== 1 ? `mgalbum_${song.albumId}` : 'mgalbum_',
      source: 'migu',
      source_url: `https://music.migu.cn/v3/music/song/${song.copyrightId}`,
      img_url: song.img1,
      // 停用代码，保留供历史对照：
      // url: `mgtrack_${song.copyrightId}`,
      lyric_url: song.ext ? song.ext.lrcUrl : '',
      tlyric_url: song.ext ? song.ext.trcUrl : '',
      quality: song.toneControl,
      url: song.copyright === 0 ? '' : undefined,
      song_id: song.songId,
      content_id: song.contentId,
    };
  }

  /**
   * 根据歌单或专辑类型请求每页 50 首曲目，转换后通过回调交出。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @param page 页面对象或从 1 开始的来源页码，按当前调用位置使用。
   * @param callback 完成当前操作后调用的回调。
   * @returns {void} 无返回值。
   */
  static mg_render_tracks(url, page, callback) {
    const list_id = getParameterByName('list_id', url).split('_').pop();
    const playlist_type = getParameterByName('list_id', url).split('_')[0];
    let tracks_url = '';
    switch (playlist_type) {
      case 'mgplaylist':
        tracks_url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/user/queryMusicListSongs.do?musicListId=${list_id}&pageNo=${page}&pageSize=50`;
        break;
      case 'mgalbum':
        tracks_url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/queryAlbumSong?albumId=${list_id}&pageNo=${page}&pageSize=50`;
        break;
      default:
        break;
    }
    axios.get(tracks_url).then(
      /**
       * 上一步异步操作完成后，调用 callback，依次传入 null、曲目数组 tracks。
       * @param response 异步请求返回的响应对象；使用 data 字段。
       * @returns {*} callback 回调的直接返回值。
       */
      (response) => {
        const data =
          playlist_type === 'mgplaylist'
            ? response.data.list
            : response.data.data.songList;
        const tracks = data.map(
          /**
           * 转换 data 中的条目，this.mg_convert_song 的调用结果。
           * @param item 来自 data 的当前条目。
           * @returns {*} this.mg_convert_song 的调用结果。
           */
          (item) => this.mg_convert_song(item)
        );
        return callback(null, tracks);
      }
    );
  }

  /**
   * 读取咪咕榜单目录；非首屏偏移直接返回空列表，避免重复追加。
   * @param offset 从列表开头跳过的条目数量。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static mg_show_toplist(offset) {
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
      'https://app.c.nf.migu.cn/MIGUM3.0/v1.0/template/rank-list/release?dataVersion=1616469593718&templateVersion=9';
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
              const migu_board =
                response.data.data.contentItemList[4].itemList.map(
                  /**
                   * 转换 response.data.data.contentItemList[4].itemList 中的条目，包含 cover_img_url、title、id、source_url 的对象。
                   * @param item 来自 response.data.data.contentItemList[4].itemList 的当前条目；使用 imageUrl、displayLogId 字段。
                   * @returns {Object} 包含 cover_img_url、title、id、source_url 的对象。
                   */
                  (item) => ({
                    cover_img_url: item.imageUrl,
                    title: item.displayLogId.param.rankName,
                    id: `mgtoplist_${item.displayLogId.param.rankId}`,
                    source_url: '',
                  })
                );
              migu_board.splice(0, 2);
              const global_board =
                response.data.data.contentItemList[7].itemList.map(
                  /**
                   * 转换 response.data.data.contentItemList[7].itemList 中的条目，包含 cover_img_url、title、id、source_url 的对象。
                   * @param item 来自 response.data.data.contentItemList[7].itemList 的当前条目；使用 imageUrl、displayLogId 字段。
                   * @returns {Object} 包含 cover_img_url、title、id、source_url 的对象。
                   */
                  (item) => ({
                    cover_img_url: item.imageUrl,
                    title: item.displayLogId.param.rankName,
                    id: `mgtoplist_${item.displayLogId.param.rankId}`,
                    source_url: '',
                  })
                );
              const chart_board = [
                {
                  cover_img_url:
                    'https://cdnmusic.migu.cn/tycms_picture/20/02/36/20020512065402_360x360_2997.png',
                  title: '尖叫新歌榜',
                  id: 'mgtoplist_27553319',
                  source: '',
                },
                {
                  cover_img_url:
                    'https://cdnmusic.migu.cn/tycms_picture/20/04/99/200408163640868_360x360_6587.png',
                  title: '尖叫热歌榜',
                  id: 'mgtoplist_27186466',
                  source: '',
                },
                {
                  cover_img_url:
                    'https://cdnmusic.migu.cn/tycms_picture/20/04/99/200408163702795_360x360_1614.png',
                  title: '尖叫原创榜',
                  id: 'mgtoplist_27553408',
                  source: '',
                },
              ];
              const result = chart_board.concat(migu_board, global_board);
              return fn({ result });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 按偏移和分类读取咪咕歌单列表，返回供调用方登记完成回调的对象。
   * @param url 携带 offset、filter_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static show_playlist(url) {
    const offset = Number(getParameterByName('offset', url));
    const filterId = getParameterByName('filter_id', url);
    if (filterId === 'toplist') {
      return this.mg_show_toplist(offset);
    }
    const pageSize = 30;
    let target_url = '';
    if (!filterId) {
      target_url = `https://app.c.nf.migu.cn/MIGUM2.0/v2.0/content/getMusicData.do?count=${pageSize}&start=${
        offset / pageSize + 1
      }&templateVersion=5&type=1`;
    } else {
      target_url = `https://app.c.nf.migu.cn/MIGUM3.0/v1.0/template/musiclistplaza-listbytag?pageNumber=${
        offset / pageSize + 1
      }&tagId=${filterId}&templateVersion=1`;
      // 停用代码，保留供历史对照：
      // const target_url = `https://m.music.migu.cn/migu/remoting/playlist_bycolumnid_tag?playListType=2&type=1&columnId=15127315&tagId=&startIndex=${offset}`;
      // columnId=15127315为推荐，15127272为最新
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
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {void} 无返回值。
             */
            (response) => {
              const data = !filterId
                ? response.data.data.contentItemList[0].itemList
                : response.data.data.contentItemList.itemList;
              const result = data.map(
                /**
                 * 转换 data 中的条目，执行 /id=([0-9]+)&/.exec。
                 * @param item 来自 data 的当前条目；使用 actionUrl、imageUrl、title 字段。
                 * @returns {Object} 包含 cover_img_url、title、id、source_url 的对象。
                 */
                (item) => {
                  const match = /id=([0-9]+)&/.exec(item.actionUrl);
                  const id = match ? match[1] : '';
                  return {
                    cover_img_url: item.imageUrl,
                    title: item.title,
                    id: `mgplaylist_${id}`,
                    source_url: `https://music.migu.cn/v3/music/playlist/${id}`,
                  };
                }
              );
              fn({ result });
            }
          )
          .catch(failure);
      },
    };
  }

  /**
   * 根据本地榜单映射获取网页数据，从内嵌歌曲数据解析榜单曲目。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static mg_toplist(url) {
    const list_id = Number(getParameterByName('list_id', url).split('_').pop());
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
        const board_list = {
          27553319: {
            name: '尖叫新歌榜',
            url: 'jianjiao_newsong',
            img: '/20/02/36/20020512065402_360x360_2997.png',
          },
          27186466: {
            name: '尖叫热歌榜',
            url: 'jianjiao_hotsong',
            img: '/20/04/99/200408163640868_360x360_6587.png',
          },
          27553408: {
            name: '尖叫原创榜',
            url: 'jianjiao_original',
            img: '/20/04/99/200408163702795_360x360_1614.png',
          },
          1: {
            name: '音乐榜',
            url: 'migumusic',
            img: '/20/05/136/200515161733982_360x360_1523.png',
          },
          2: {
            name: '影视榜',
            url: 'movies',
            img: '/20/05/136/200515161848938_360x360_673.png',
          },
          23189399: {
            name: '内地榜',
            url: 'mainland',
            img: '/20/08/231/200818095104122_327x327_4971.png',
          },
          23189800: {
            name: '港台榜',
            url: 'hktw',
            img: '/20/08/231/200818095125191_327x327_2382.png',
          },
          19190036: {
            name: '欧美榜',
            url: 'eur_usa',
            img: '/20/08/231/200818095229556_327x327_1383.png',
          },
          23189813: {
            name: '日韩榜',
            url: 'jpn_kor',
            img: '/20/08/231/200818095259569_327x327_4628.png',
          },
          23190126: {
            name: '彩铃榜',
            url: 'coloring',
            img: '/20/08/231/200818095356693_327x327_7955.png',
          },
          15140045: {
            name: 'KTV榜',
            url: 'ktv',
            img: '/20/08/231/200818095414420_327x327_4992.png',
          },
          15140034: {
            name: '网络榜',
            url: 'network',
            img: '/20/08/231/200818095442606_327x327_1298.png',
          },
          23218151: {
            name: '新专辑榜',
            url: 'newalbum',
            img: '/20/08/231/200818095603246_327x327_7480.png',
          },
          33683712: {
            name: '数字专辑畅销榜',
            url: '',
            img: 'https://d.musicapp.migu.cn/prod/file-service/file-down/bcb5ddaf77828caee4eddc172edaa105/2297b53efa678bbc8a5b83064622c4c8/ebfe5bff9fd9981b5ae1c043f743bfb3',
          },
          23217754: {
            name: 'MV榜',
            url: 'mv',
            img: '/20/08/231/200818095656365_327x327_8344.png',
          },
          21958042: {
            name: '美国iTunes榜',
            url: 'itunes',
            img: '/20/08/231/200818095755771_327x327_9250.png',
          },
          21975570: {
            name: '美国billboard榜',
            url: 'billboard',
            img: '/20/08/231/20081809581365_327x327_4636.png',
          },
          22272815: {
            name: 'Hito中文榜',
            url: 'hito',
            img: '/20/08/231/200818095834912_327x327_5042.png',
          },
          22272943: {
            name: '韩国Melon榜',
            url: 'mnet',
            img: '/20/08/231/200818095926828_327x327_3277.png',
          },
          22273437: {
            name: '英国UK榜',
            url: 'uk',
            img: '/20/08/231/200818095950791_327x327_8293.png',
          },
        };
        const target_url = `https://music.migu.cn/v3/music/top/${board_list[list_id].url}`;

        axios
          .get(target_url)
          .then(
            /**
             * 上一步异步操作完成后，更新 tracks，调用 fn，依次传入 包含 tracks、info 的对象。
             * @param response 异步请求返回的响应对象。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response;
              const info = {
                id: `mgtoplist_${list_id}`,
                cover_img_url:
                  list_id === 33683712
                    ? board_list[list_id].img
                    : `https://cdnmusic.migu.cn/tycms_picture${board_list[list_id].img}`,
                title: data.data
                  ? data.data.columnInfo.title
                  : board_list[list_id].name,
                source_url: `https://music.migu.cn/v3/music/top/${board_list[list_id].url}`,
              };
              let tracks = [];
              const list_elements = new DOMParser()
                .parseFromString(data, 'text/html')
                .getElementsByTagName('script');
              const result = JSON.parse(
                list_elements[1].innerText.split('=').slice(1).join('=')
              );
              if (result.songs && result.songs.items) {
                tracks = result.songs.items.map(
                  /**
                   * 转换 result.songs.items 中的条目，更新 songAlbum、songAlbumId、track.quality。
                   * @param song 来自 result.songs.items 的当前条目；使用 album、copyrightId、name、singers、mediumPic、id、bit24、sq 字段。
                   * @returns {Object} 统一曲目对象 track。
                   */
                  (song) => {
                    let songAlbum = '';
                    let songAlbumId = 'mgalbum_';
                    if (song.album && song.album.albumId !== 1) {
                      songAlbum = song.album.albumName;
                      songAlbumId = `mgalbum_${song.album.albumId}`;
                    }
                    const track = {
                      id: `mgtrack_${song.copyrightId}`,
                      title: song.name,
                      artist: song.singers[0].name,
                      artist_id: `mgartist_${song.singers[0].id}`,
                      album: songAlbum,
                      album_id: songAlbumId,
                      source: 'migu',
                      source_url: `https://music.migu.cn/v3/music/song/${song.copyrightId}`,
                      img_url: `https:${song.mediumPic}`,
                      // 停用代码，保留供历史对照：
                      // url: `mgtrack_${song.copyrightId}`,
                      lyric_url: 'null',
                      tlyric_url: '',
                      song_id: song.id,
                      url: undefined,
                    };
                    if (song.bit24) {
                      track.quality = '111111';
                    } else if (song.sq) {
                      track.quality = '111100';
                    } else {
                      track.quality = '110000';
                    }
                    return track;
                  }
                );
              }
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
   * 读取歌单总数并以每页 50 首遍历所有页，合并元信息和曲目。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static mg_get_playlist(url) {
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
        const info_url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/resourceinfo.do?needSimple=00&resourceType=2021&resourceId=${list_id}`;
        axios
          .get(info_url)
          .then(
            /**
             * 上一步异步操作完成后，执行 Math.ceil。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {void} 无返回值。
             */
            (response) => {
              const info = {
                id: `mgplaylist_${list_id}`,
                cover_img_url: response.data.resource[0].imgItem.img,
                title: response.data.resource[0].title,
                source_url: `https://music.migu.cn/v3/music/playlist/${list_id}`,
              };
              const total = response.data.resource[0].musicNum;
              const page = Math.ceil(total / 50);
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
                 * 进入此回调后，执行 this.mg_render_tracks。
                 * @param item 当前遍历或处理的条目。
                 * @param callback 完成当前操作后调用的回调。
                 * @returns {*} this.mg_render_tracks 的调用结果。
                 */
                (item, callback) => this.mg_render_tracks(url, item, callback),
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
   * 读取专辑总数并以每页 50 首遍历所有页，合并曲目。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static mg_album(url) {
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
        const info_url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/resourceinfo.do?needSimple=00&resourceType=2003&resourceId=${album_id}`;
        axios
          .get(info_url)
          .then(
            /**
             * 上一步异步操作完成后，执行 Math.ceil。
             * @param response 异步请求返回的响应对象。
             * @returns {void} 无返回值。
             */
            (response) => {
              const { data } = response;
              const info = {
                id: `mgalbum_${album_id}`,
                cover_img_url: data.resource[0].imgItems[1].img,
                title: data.resource[0].title,
                source_url: `https://music.migu.cn/v3/music/album/${album_id}`,
              };
              const total = data.resource[0].totalCount;
              const page = Math.ceil(total / 50);
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
                 * 进入此回调后，执行 this.mg_render_tracks。
                 * @param item 当前遍历或处理的条目。
                 * @param callback 完成当前操作后调用的回调。
                 * @returns {*} this.mg_render_tracks 的调用结果。
                 */
                (item, callback) => this.mg_render_tracks(url, item, callback),
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
   * 读取咪咕歌手资料与接口提供的歌曲列表，转换为统一列表详情。
   * @param url 携带 list_id、offset 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static mg_artist(url) {
    const artist_id = getParameterByName('list_id', url).split('_').pop();
    const offset = Number(getParameterByName('offset', url));
    const pageSize = 50;
    const page = offset / pageSize + 1;
    const target_url = `https://app.c.nf.migu.cn/MIGUM2.0/v1.0/content/singer_songs.do?pageNo=${page}&pageSize=${pageSize}&resourceType=2&singerId=${artist_id}`;

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
                id: `mgartist_${artist_id}`,
                cover_img_url: data.singer.imgs[1].img,
                title: data.singer.singer,
                source_url: `https://music.migu.cn/v3/music/artist/${artist_id}/song`,
              };

              const tracks = data.songlist.map(
                /**
                 * 转换 data.songlist 中的条目，this.mg_convert_song 的调用结果。
                 * @param item 来自 data.songlist 的当前条目。
                 * @returns {*} this.mg_convert_song 的调用结果。
                 */
                (item) => this.mg_convert_song(item)
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
   * 根据曲目音质选择 toneFlag，请求播放地址并规范化转义字符，回传平台及码率。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 content_id、id、quality 字段。
   * @param success 接收成功业务结果的回调。
   * @param failure 接收失败原因的回调；省略时沿用声明中的默认处理。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {void} 无返回值。
   */
  static bootstrap_track(track, success, failure, options = {}) {
    const request = RequestTask.http(options);
    const sound = {};
    const contentId = track.content_id;
    const copyrightId = track.id.slice('mgtrack_'.length);
    /* 停用代码，保留供历史对照：
const copyrightId = track.id.slice('mgtrack_'.length);
    const type = 1;
    // 注意：旧方案未采用 Howler 的 FLAC 播放支持。
    // 当时的网络请求可能长时间挂起并阻塞后续曲目。
    // 因此旧方案固定使用普通音质。

    // switch (track.quality) {
    //   case '110000':
    //     type = 2;
    //     break;
    //   case '111100':
    //     type = 3;
    //     break;
    //   case '111111':
    //     type = 4;
    //     break;
    //   default:
    //     type = 1;
    // }
    const k =
      '4ea5c508a6566e76240543f8feb06fd457777be39549c4016436afda65d2330e';
    // 音质参数：1 为普通，2 为 hq，3 为 sq，4 为 zq，5 为 z3d
    const plain = forge.util.createBuffer(
      `{"copyrightId":"${copyrightId}","type":${type},"auditionsFlag":0}`
    );
    const salt = forge.random.getBytesSync(8);
    const derivedBytes = forge.pbe.opensslDeriveBytes(k, salt, 48);
    const buffer = forge.util.createBuffer(derivedBytes);
    const key = buffer.getBytes(32);
    const iv = buffer.getBytes(16);

    const cipher = forge.cipher.createCipher('AES-CBC', key);
    cipher.start({ iv });
    cipher.update(plain);
    cipher.finish();
    const output = forge.util.createBuffer();
    output.putBytes('Salted__');
    output.putBytes(salt);
    output.putBuffer(cipher.output);
    const aesResult = forge.util.encode64(output.bytes());

    const publicKey =
      '-----BEGIN PUBLIC KEY-----\nMIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQC8asrfSaoOb4je+DSmKdriQJKW\nVJ2oDZrs3wi5W67m3LwTB9QVR+cE3XWU21Nx+YBxS0yun8wDcjgQvYt625ZCcgin\n2ro/eOkNyUOTBIbuj9CvMnhUYiR61lC1f1IGbrSYYimqBVSjpifVufxtx/I3exRe\nZosTByYp4Xwpb1+WAQIDAQAB\n-----END PUBLIC KEY-----';
    const secKey = forge.util.encode64(
      forge.pki.publicKeyFromPem(publicKey).encrypt(k)
    );

    const target_url = `https://music.migu.cn/v3/api/music/audioPlayer/getPlayInfo?dataType=2&data=${encodeURIComponent(
      aesResult
    )}&secKey=${encodeURIComponent(secKey)}`; */
    let toneFlag;
    switch (track.quality) {
      case '110000':
        toneFlag = 'HQ';
        break;
      case '111100':
        toneFlag = 'SQ';
        break;
      case '111111':
        toneFlag = 'ZQ';
        break;
      default:
        toneFlag = 'PQ';
    }
    // 停用代码，保留供历史对照：
    // const target_url = `https://app.c.nf.migu.cn/MIGUM2.0/strategy/listen-url/v2.2?netType=01&resourceType=E&songId=${songId}&toneFlag=${toneFlag}`;
    const target_url = `https://app.c.nf.migu.cn/MIGUM3.0/strategy/pc/listen/v1.0?scene=&netType=01&resourceType=2&copyrightId=${copyrightId}&contentId=${contentId}&toneFlag=${toneFlag}`;
    request
      .get(target_url, {
        headers: {
          channel: '0146951',
          uid: 1234,
        },
      })
      .then(
        /**
         * 上一步异步操作完成后，更新 playUrl、sound.url、sound.platform、sound.bitrate，调用 success，依次传入 播放地址对象 sound。
         * @param response 异步请求返回的响应对象；使用 data 字段。
         * @returns {void} 无返回值。
         */
        (response) => {
          // 停用代码，保留供历史对照：
          // const { data } = response.data;
          // let playUrl = response.data.data ? response.data.data.playUrl : null;
          let playUrl = response.data.data ? response.data.data.url : null;
          if (playUrl) {
            if (playUrl.startsWith('//')) {
              playUrl = `https:${playUrl}`;
            }
            sound.url = playUrl.replace(/\+/g, '%2B');
            sound.platform = 'migu';
            switch (toneFlag) {
              case 'HQ':
                sound.bitrate = '320kbps';
                break;
              case 'SQ':
                sound.bitrate = '999kbps';
                break;
              case 'ZQ':
                sound.bitrate = '999kbps';
                break;
              default:
                sound.bitrate = '128kbps';
            }
            success(sound);
          } else {
            failure(sound);
          }
        }
      )
      .catch(failure);
  }

  /**
   * 按每页 20 项请求搜索，歌曲接口缺少可靠总数时返回 null；歌单沿用接口提供的总数。
   * @param url 携带 keywords、curpage、type 查询参数的内部请求地址。
   * @param [options] 本次操作选项；默认值为 空对象。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static search(url, options = {}) {
    const request = RequestTask.http(options);
    const keyword = encodeURIComponent(getParameterByName('keywords', url));
    const curpage = getParameterByName('curpage', url);
    const searchType = getParameterByName('type', url);
    // 停用代码，保留供历史对照：
    // const sid = (this.uuid() + this.uuid()).replace(/-/g, '');
    // // let type ='';
    // let searchSwitch = '';
    // let target_url =
    //   'https://jadeite.migu.cn/music_search/v2/search/searchAll?';
    // switch (searchType) {
    // 停用代码，保留供历史对照：
    // case '0':
    //     searchSwitch = '{"song":1}'; // {"song":1,"album":0,"singer":0,"tagSong":1,"mvSong":0,"bestShow":1,"songlist":0,"lyricSong":0}
    //     // type = 2;
    //     target_url =
    //       `${target_url}sid=${sid}&isCorrect=1&isCopyright=1` +
    //       `&searchSwitch=${encodeURIComponent(searchSwitch)}&pageSize=20` +
    //       `&text=${encodeURIComponent(keyword)}&pageNo=${curpage}` +
    //       '&feature=1000000000&sort=1';
    //     break;
    //   case '1':
    //     searchSwitch = '{"songlist":1}';
    //     // type = 6;
    //     target_url =
    //       `${target_url}sid=${sid}&isCorrect=1&isCopyright=1` +
    //       `&searchSwitch=${encodeURIComponent(searchSwitch)}` +
    //       '&userFilter=%7B%22songlisttag%22%3A%5B%5D%7D&pageSize=20' +
    //       `&text=${encodeURIComponent(keyword)}&pageNo=${curpage}` +
    //       // + `&sort=1&userSort=%7B%22songlist%22%3A%22default%22%7D`;
    //       '&feature=0000000010&sort=1';
    //     break;
    //   default:
    //     break;
    // }
    // const target_url = `https://pd.musicapp.migu.cn/MIGUM3.0/v1.0/content/search_all.do?&isCopyright=0&isCorrect=0&text=${keyword}&pageNo=${curpage}&searchSwitch=${searchSwitch}`;
    // const target_url = `https://m.music.migu.cn/migu/remoting/scr_search_tag?rows=20&type=${type}&keyword=${keyword}'&pgc=${curpage}`;
    let target_url = `https://app.u.nf.migu.cn/pc/resource/song/item/search/v1.0?text=${keyword}&pageNo=${curpage}&pageSize=20`;
    if (searchType === '1') {
      target_url = `https://app.u.nf.migu.cn/pc/v1.0/content/search_all.do?text=${keyword}&pageNo=${curpage}&pageSize=20&searchSwitch={%22songlist%22:+1}`;
    }
    // 停用代码，保留供历史对照：
    // const deviceId = forge.md5
    //   .create()
    //   .update(this.uuid().replace(/-/g, ''))
    //   .digest()
    //   .toHex()
    //   .toLocaleUpperCase(); // 设备的UUID
    // const timestamp = new Date().getTime();
    // const signature_md5 = '6cdc72a439cef99a3418d2a78aa28c73'; // app签名证书的md5
    // const text = `${
    //   keyword + signature_md5
    // 停用代码，保留供历史对照：
    // }yyapp2d16148780a1dcc7408e06336b98cfd50${deviceId}${timestamp}`;
    // const sign = forge.md5
    //   .create(text)
    //   .update(forge.util.encodeUtf8(text))
    //   .digest()
    //   .toHex();
    // const headers = {
    //   // android_id: 'db2cd8c4cdc1345f',
    //   appId: 'yyapp2',
    //   // brand: 'google',
    //   // channel: '0147151',
    //   deviceId,
    //   // HWID: '',
    //   // IMEI: '',
    //   // IMSI: '',
    //   // ip: '192.168.1.101',
    //   // mac: '02:00:00:00:00:00',
    //   // 'mgm-Network-standard': '01',
    //   // 'mgm-Network-type': '04',
    //   // mode: 'android',
    //   // msisdn: '',
    //   // OAID: '',
    //   // os: 'android 7.0',
    //   // osVersion: 'android 7.0',
    //   // platform: 'G011C',
    //   sign,
    //   timestamp,
    //   // ua: 'Android_migu',
    //   // uid: '',
    //   uiVersion: 'A_music_3.3.0',
    //   version: '7.0.4',
    // };
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
        request
          .get(target_url, {
            // 停用代码，保留供历史对照：
            // headers,
          })
          .then(
            /**
             * 上一步异步操作完成后，更新 result、total，调用 fn，依次传入 包含 result、total、type 的对象。
             * @param response 异步请求返回的响应对象。
             * @returns {*} fn 回调的直接返回值。
             */
            (response) => {
              const { data } = response;
              let result = [];
              let total = 0;
              if (searchType === '0') {
                if (data) {
                  result = data.map(
                    /**
                     * 转换 data 中的条目，this.mg_convert_song2 的调用结果。
                     * @param item 来自 data 的当前条目。
                     * @returns {*} this.mg_convert_song2 的调用结果。
                     */
                    (item) => this.mg_convert_song2(item)
                  );
                  // 接口未提供可靠总数。
                  total = null;
                }
              } else if (searchType === '1') {
                if (data.songListResultData.result) {
                  result = data.songListResultData.result.map(
                    /**
                     * 转换 data.songListResultData.result 中的条目，包含 id、title、source、source_url、img_url、url、author、count 的对象。
                     * @param item 来自 data.songListResultData.result 的当前条目；使用 id、name、imgItems、userName、musicNum 字段。
                     * @returns {Object} 包含 id、title、source、source_url、img_url、url、author、count 的对象。
                     */
                    (item) => ({
                      // 停用代码，保留供历史对照：
                      // result = data.songLists.map(item => ({
                      id: `mgplaylist_${item.id}`,
                      title: item.name,
                      source: 'migu',
                      source_url: `https://music.migu.cn/v3/music/playlist/${item.id}`,
                      // 停用代码，保留供历史对照：
                      // img_url: item.img,
                      img_url: item.imgItems[0].img,
                      url: `mgplaylist_${item.id}`,
                      author: item.userName,
                      count: item.musicNum,
                    })
                  );
                  total = data.songListResultData.totalCount;
                }
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

  // https://abhishekdutta.org/blog/standalone_uuid_generator_in_javascript.html
  /**
   * 借助临时 Blob URL 提取唯一标识，并立即撤销 URL 释放资源。
   * 无参数。
   * @returns {string} 从临时 Blob URL 中提取的标识。
   */
  static uuid() {
    const temp_url = URL.createObjectURL(new Blob());
    const strTemp = temp_url.toString();
    URL.revokeObjectURL(temp_url);
    return strTemp.substr(strTemp.lastIndexOf('/') + 1); // 去掉 Blob URL 的前缀，只保留生成的标识部分。
  }

  /**
   * 读取咪咕原文和可用的译文歌词，沿用 lyric／tlyric 响应字段。
   * @param url 携带 lyric_url、tlyric_url、track_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lyric(url) {
    const lyric_url = getParameterByName('lyric_url', url);
    const tlyric_url = getParameterByName('tlyric_url', url);
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
        if (lyric_url !== 'null') {
          async.parallel(
            [
              /**
               * 进入此回调后，调用 callback，依次传入 null、"[00:00.00]暂无歌词\r\n[00:02.00]\r\n"。
               * @param callback 完成当前操作后调用的回调。
               * @returns {*} callback 回调的直接返回值。
               */
              (callback) => {
                if (lyric_url) {
                  axios
                    .get(lyric_url)
                    .then(
                      /**
                       * 上一步异步操作完成后，调用 callback，依次传入 null、response.data。
                       * @param response 异步请求返回的响应对象；使用 data 字段。
                       * @returns {*} callback 回调的直接返回值。
                       */
                      (response) => callback(null, response.data)
                    )
                    .catch(failure);
                } else {
                  return callback(null, '[00:00.00]暂无歌词\r\n[00:02.00]\r\n');
                }
              },
              /**
               * 进入此回调后，调用 callback，依次传入 null、""。
               * @param callback 完成当前操作后调用的回调。
               * @returns {*} callback 回调的直接返回值。
               */
              (callback) => {
                if (tlyric_url) {
                  axios
                    .get(tlyric_url)
                    .then(
                      /**
                       * 上一步异步操作完成后，调用 callback，依次传入 null、response.data。
                       * @param response 异步请求返回的响应对象；使用 data 字段。
                       * @returns {*} callback 回调的直接返回值。
                       */
                      (response) => callback(null, response.data)
                    )
                    .catch(failure);
                } else {
                  return callback(null, '');
                }
              },
            ],
            /**
             * 进入此回调后，调用 fn，依次传入 包含 lyric、tlyric 的对象。
             * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
             * @param results 批量操作的结果集合。
             * @returns {*} fn 回调的直接返回值。
             */
            (err, results) => {
              const data = this.mg_generate_translation(results[0], results[1]);
              return fn({
                lyric: data.lrc,
                tlyric: data.tlrc,
              });
            }
          );
        } else {
          const song_id = getParameterByName('track_id', url).split('_').pop();
          const target_url = `https://music.migu.cn/v3/api/music/audioPlayer/getLyric?copyrightId=${song_id}`;
          axios
            .get(target_url)
            .then(
              /**
               * 上一步异步操作完成后，调用 fn，依次传入 包含 lyric、tlyric 的对象。
               * @param response 异步请求返回的响应对象；使用 data 字段。
               * @returns {*} fn 回调的直接返回值。
               */
              (response) => {
                const data = this.mg_generate_translation(
                  response.data.lyric,
                  response.data.translatedLyric
                );
                return fn({
                  lyric: data.lrc,
                  tlyric: data.tlrc,
                });
              }
            )
            .catch(failure);
        }
      },
    };
  }

  /**
   * 移除译文与原文重复的标题和作者等元信息，保留歌词时间线后返回双语结果。
   * @param plain 原文歌词文本。
   * @param translation 翻译歌词文本。
   * @returns {Object} 包含 lrc、tlrc 的对象。
   */
  static mg_generate_translation(plain, translation) {
    if (!translation) {
      return {
        lrc: plain,
        tlrc: '',
      };
    }
    const arr_plain = plain.split('\n');
    let arr_translation = translation.split('\n');
    // 歌词和翻译顶部信息不一定都有，会导致行列对不齐，所以删掉
    const reg_head = /\[(ti|ar|al|by|offset|kana|high):/;
    let plain_head_line = 0;
    let trans_head_line = 0;
    for (let i = 0; i < 7; i += 1) {
      if (reg_head.test(arr_plain[i])) {
        plain_head_line += 1;
      }
      if (reg_head.test(arr_translation[i])) {
        trans_head_line += 1;
      }
    }
    arr_plain.splice(0, plain_head_line);
    arr_translation.splice(0, trans_head_line);
    // 删除翻译与原歌词重复的歌曲名，歌手、作曲、作词等信息
    const reg_info =
      /(\u4f5c|\u7f16)(\u8bcd|\u66f2)|\u6b4c(\u624b|\u66f2)\u540d|Written by/;
    let trans_info_line = 0;
    for (let i = 0; i < 6; i += 1) {
      if (reg_info.test(arr_translation[i])) {
        trans_info_line += 1;
      }
    }
    arr_translation = arr_translation.splice(trans_info_line);
    const tlrc = arr_translation.join('\r\n');
    return {
      lrc: plain,
      tlrc,
    };
  }

  /**
   * 识别咪咕分享链接并转换为内部列表 ID；通过 success 回调交出匹配结果，无匹配时为 undefined。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static parse_url(url) {
    let result;
    // eslint-disable-next-line no-param-reassign
    url = url.replace(
      'music.migu.cn/v3/my/playlist/',
      'music.migu.cn/v3/music/playlist/'
    );
    const regex = /\/\/music.migu.cn\/v3\/music\/playlist\/([0-9]+)/g;
    const regex_result = regex.exec(url);
    if (regex_result) {
      result = {
        type: 'playlist',
        id: `mgplaylist_${regex_result[1]}`,
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
   * 按列表 ID 前缀路由咪咕的歌单、专辑或歌手详情；不支持的前缀返回 null。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {*} 根据当前分支返回相应结果，可能的形式为 *、null。
   */
  static get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_')[0];
    switch (list_id) {
      case 'mgplaylist':
        return this.mg_get_playlist(url);
      case 'mgalbum':
        return this.mg_album(url);
      case 'mgartist':
        return this.mg_artist(url);
      case 'mgtoplist':
        return this.mg_toplist(url);
      default:
        return null;
    }
  }

  /**
   * 提供咪咕的推荐分类与全部分类，通过 success 回调交出筛选结构。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_playlist_filters() {
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
        let target_url =
          'https://app.c.nf.migu.cn/MIGUM3.0/v1.0/template/musiclistplaza-hottaglist/release';
        axios
          .get(target_url)
          .then(
            /**
             * 上一步异步操作完成后，更新 target_url，执行 axios.get().then().catch。
             * @param response 异步请求返回的响应对象；使用 data 字段。
             * @returns {void} 无返回值。
             */
            (response) => {
              const recommend = response.data.data.contentItemList.map(
                /**
                 * 转换 response.data.data.contentItemList 中的条目，包含 id、name 的对象。
                 * @param item 来自 response.data.data.contentItemList 的当前条目；使用 tagId、tagName 字段。
                 * @returns {Object} 包含 id、name 的对象。
                 */
                (item) => ({
                  id: item.tagId,
                  name: item.tagName,
                })
              );
              recommend.unshift(
                { id: '', name: '推荐' },
                { id: 'toplist', name: '排行榜' }
              );
              target_url =
                'https://app.c.nf.migu.cn/MIGUM3.0/v1.0/template/musiclistplaza-taglist/release?templateVersion=1';
              axios
                .get(target_url)
                .then(
                  /**
                   * 上一步异步操作完成后，调用 fn，依次传入 包含 recommend、all 的对象。
                   * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
                   * @returns {*} fn 回调的直接返回值。
                   */
                  (res) => {
                    const all = res.data.data.map(
                      /**
                       * 转换 res.data.data 中的条目，更新 result.filters，执行 cate.content.map。
                       * @param cate 来自 res.data.data 的当前条目；使用 header、content 字段。
                       * @returns {Object} 整理后的结果 result。
                       */
                      (cate) => {
                        const result = { category: cate.header.title };
                        result.filters = cate.content.map(
                          /**
                           * 转换 cate.content 中的条目，包含 id、name 的对象。
                           * @param item 来自 cate.content 的当前条目；使用 texts 字段。
                           * @returns {Object} 包含 id、name 的对象。
                           */
                          (item) => ({
                            id: item.texts[1],
                            name: item.texts[0],
                          })
                        );
                        return result;
                      }
                    );
                    return fn({
                      recommend,
                      all,
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
   * 读取咪咕当前登录用户，按统一 status 和 data 结构回传结果。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static get_user() {
    const ts = +new Date();
    const url = `https://music.migu.cn/v3/api/user/getUserInfo?_=${ts}`;
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
             * 上一步异步操作完成后，更新 status、result，调用 fn，依次传入 包含 status、data 的对象。
             * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
             * @returns {*} fn 回调的直接返回值。
             */
            (res) => {
              let result = { is_login: false };
              let status = 'fail';

              if (res.data.success) {
                status = 'success';
                const { data } = res;
                result = {
                  is_login: true,
                  user_id: data.user.uid,
                  user_name: data.user.mobile,
                  nickname: data.user.nickname,
                  avatar: data.user.avatar.midAvatar,
                  platform: 'migu',
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
   * 返回咪咕登录入口地址。
   * 无参数。
   * @returns {string} 按当前字段拼接的字符串。
   */
  static get_login_url() {
    return `https://music.migu.cn`;
  }

  /**
   * 清除咪咕使用的认证 Cookie。
   * 无参数。
   * @returns {void} 无返回值。
   */
  static logout() {
    /**
     * 删除指定地址下的咪咕认证 Cookie。
     * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
     * @param name 待查找或注册的名称。
     * @returns {*} cookieRemove 的调用结果。
     */
    const removeFn = (url, name) =>
      cookieRemove(
        {
          url,
          name,
        },
        /**
         * 保留的空回调，此处无需继续处理或改变状态。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {}
      );
    const musicCookieList = [
      'migu_music_sid',
      'migu_music_platinum',
      'migu_music_level',
      'migu_music_nickname',
      'migu_music_avatar',
      'migu_music_uid',
      'migu_music_credit_level',
      'migu_music_passid',
      'migu_music_email',
      'migu_music_msisdn',
      'migu_music_status',
    ];
    const passportCookieList = ['USessionID', 'LTToken'];
    musicCookieList.map(
      /**
       * 转换 musicCookieList 中的条目，removeFn 的调用结果。
       * @param name 来自 musicCookieList 的当前条目。
       * @returns {*} removeFn 的调用结果。
       */
      (name) => removeFn('https://music.migu.cn', name)
    );
    passportCookieList.map(
      /**
       * 转换 passportCookieList 中的条目，removeFn 的调用结果。
       * @param name 来自 passportCookieList 的当前条目。
       * @returns {*} removeFn 的调用结果。
       */
      (name) => removeFn('https://passport.migu.cn', name)
    );
  }

  // 停用代码，保留供历史对照：
  // return {
  //   show_playlist: mg_show_playlist,
  //   get_playlist_filters,
  //   get_playlist,
  //   parse_url: mg_parse_url,
  //   bootstrap_track: mg_bootstrap_track,
  //   search: mg_search,
  //   lyric: mg_lyric,
  //   get_user: migu_get_user,
  //   get_login_url: migu_get_login_url,
  //   logout: mg_logout,
  // };
}
