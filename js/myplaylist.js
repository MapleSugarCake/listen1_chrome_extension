/**
 * 文件职责：实现自建及收藏歌单的本地存储协议，以有序 ID 列表和独立歌单记录支持增删、去重与重排。
 *
 * 文件级定义：
 * - myplaylistFactory：构造以有序歌单 ID 列表和独立 JSON 记录为基础的本地歌单服务。
 * - myplaylist：本地自建和收藏歌单服务的单例。
 */
/* eslint-disable no-unused-vars */
/* global getParameterByName */
/**
 * 构造以有序歌单 ID 列表和独立 JSON 记录为基础的本地歌单服务。
 * 无参数。
 * @returns {Object} 包含 show_myplaylist、save_myplaylist、get_playlist、remove_myplaylist、add_track_to_myplaylist、remove_track_from_myplaylist、create_myplaylist、edit_myplaylist、myplaylist_containers、insert_track_to_myplaylist、insert_myplaylist_to_myplaylists 的对象。
 */
const myplaylistFactory = () => {
  /**
   * 原地移动数组元素，目标越界时先补 undefined 占位。
   * @param arr 待移动或格式化的数组；使用 push、splice 字段。
   * @param old_index 移动前的数组索引。
   * @param new_index 移动后的数组索引。
   * @returns {*} arr。
   */
  function array_move(arr, old_index, new_index) {
    // https://stackoverflow.com/questions/5306680/move-an-array-element-from-one-array-position-to-another
    if (new_index >= arr.length) {
      let k = new_index - arr.length + 1;
      while (k > 0) {
        k -= 1;
        arr.push(undefined);
      }
    }
    arr.splice(new_index, 0, arr.splice(old_index, 1)[0]);
    return arr; // 保留的测试调用。
  }
  /**
   * 将 my／favorite 分类映射到既有的本地存储索引键。
   * @param playlist_type 自建或收藏歌单分类。
   * @returns {string} key。
   */
  function getPlaylistObjectKey(playlist_type) {
    let key = '';
    if (playlist_type === 'my') {
      key = 'playerlists';
    } else if (playlist_type === 'favorite') {
      key = 'favoriteplayerlists';
    }
    return key;
  }
  // 自建与收藏歌单使用有序 ID 索引，
  // 每个歌单单独保存记录；重排只修改索引，
  // 无需重写每份歌单。
  /**
   * 依照本地索引顺序读取歌单，移除历史曲目的旧 url 字段。
   * @param playlist_type 自建或收藏歌单分类。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  function show_myplaylist(playlist_type) {
    return {
      /**
       * 登记或执行旧式成功入口，更新 playlists，调用 fn，依次传入 包含 result 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success(fn) {
        const key = getPlaylistObjectKey(playlist_type);
        if (key === '') {
          return fn({ result: [] });
        }
        let playlists = localStorage.getObject(key);
        if (playlists == null) {
          playlists = [];
        }
        const result = playlists.reduce(
          /**
           * 归并 playlists 中的条目，执行 localStorage.getObject。
           * @param res 上一步归并得到的累计结果；使用 push 字段。
           * @param id 来自 playlists 的当前条目。
           * @returns {*} res。
           */
          (res, id) => {
          const playlist = localStorage.getObject(id);
          if (playlist !== null && playlist.tracks !== undefined) {
            // 读取历史歌单时清除旧 url 字段。
            playlist.tracks.forEach(
              /**
               * 逐项处理 playlist.tracks 中的条目，保留此调用位置的接口形状。
               * @param e 来自 playlist.tracks 的当前条目；使用 url 字段。
               * @returns {void} 无返回值。
               */
              (e) => {
              delete e.url;
            });
          }
          res.push(playlist);
          return res;
        }, []);
        return fn({ result });
      },
    };
  }

  /**
   * 按查询参数读取自建歌单，清理旧播放地址和禁用状态后传给回调。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  function get_myplaylist(url) {
    const list_id = getParameterByName('list_id', url);
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 歌单对象 playlist；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success(fn) {
        const playlist = localStorage.getObject(list_id);
        // 读取历史歌单时清除旧 url 字段。
        if (playlist !== null && playlist.tracks !== undefined) {
          playlist.tracks.forEach(
            /**
             * 逐项处理 playlist.tracks 中的条目，更新 e.disabled。
             * @param e 来自 playlist.tracks 的当前条目；使用 url、disabled 字段。
             * @returns {void} 无返回值。
             */
            (e) => {
            delete e.url;
            e.disabled = false;
          });
        }
        fn(playlist);
      },
    };
  }

  /**
   * 组合随机十六进制片段生成本地歌单标识，不用于密码学用途。
   * 无参数。
   * @returns {string} 用于新歌单 ID 的随机十六进制标识。
   */
  function guid() {
    /**
     * 生成四位十六进制随机片段供歌单 ID 拼接。
     * 无参数。
     * @returns {string} 四位十六进制片段。
     */
    function s4() {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .substring(1);
    }
    return `${s4() + s4()}-${s4()}-${s4()}-${s4()}-${s4()}${s4()}${s4()}`;
  }

  /**
   * 在对应分类索引中把歌单移动到目标歌单前后，并保存新顺序。
   * @param playlist_type 自建或收藏歌单分类。
   * @param playlist_id 目标歌单 ID。
   * @param to_playlist_id 重排时作为参照的歌单 ID。
   * @param direction 插入或切换方向，使用调用方约定的前后标记。
   * @returns {*} 空数组；其他分支返回 playlists。
   */
  function insert_myplaylist_to_myplaylists(
    playlist_type,
    playlist_id,
    to_playlist_id,
    direction
  ) {
    const key = getPlaylistObjectKey(playlist_type);
    if (key === '') {
      return [];
    }
    const playlists = localStorage.getObject(key);

    const index = playlists.findIndex(
      /**
       * 筛选检查 playlists 中的条目，i 是否严格等于 playlist_id。
       * @param i 来自 playlists 的当前条目。
       * @returns {boolean} i 是否严格等于 playlist_id。
       */
      (i) => i === playlist_id);
    let insertIndex = playlists.findIndex(
      /**
       * 筛选检查 playlists 中的条目，i 是否严格等于 to_playlist_id。
       * @param i 来自 playlists 的当前条目。
       * @returns {boolean} i 是否严格等于 to_playlist_id。
       */
      (i) => i === to_playlist_id);
    if (index === insertIndex) {
      return playlists;
    }
    if (insertIndex > index) {
      insertIndex -= 1;
    }
    const offset = direction === 'top' ? 0 : 1;

    array_move(playlists, index, insertIndex + offset);

    localStorage.setObject(key, playlists);
    return playlists;
  }

  /**
   * 保存自建或收藏歌单；自建项生成新 ID，收藏项保留远程 ID 并去掉易过期的曲目快照。
   * @param playlist_type 自建或收藏歌单分类。
   * @param playlistObj 待保存的歌单对象。
   * @returns {void} 无返回值。
   */
  const save_myplaylist = (playlist_type, playlistObj) => {
    const playlist = playlistObj;
    const key = getPlaylistObjectKey(playlist_type);
    if (key === '') {
      return;
    }
    let playlists = localStorage.getObject(key);
    if (playlists == null) {
      playlists = [];
    }
    // 更新歌单 ID。
    let playlist_id = '';
    if (playlist_type === 'my') {
      playlist_id = `myplaylist_${guid()}`;
      playlist.info.id = playlist_id;
      playlist.is_mine = 1; // eslint-disable-line no-param-reassign
    } else if (playlist_type === 'favorite') {
      playlist_id = playlist.info.id;
      playlist.is_fav = 1;
      // 收藏歌单会从来源刷新，
      // 因此不保存可能过期的曲目快照。
      delete playlist.tracks;
    }

    playlists.push(playlist_id);
    localStorage.setObject(key, playlists);
    localStorage.setObject(playlist_id, playlist);
  };

  /**
   * 删除歌单记录及其分类索引中的 ID。
   * @param playlist_type 自建或收藏歌单分类。
   * @param playlist_id 目标歌单 ID。
   * @returns {void} 无返回值。
   */
  const remove_myplaylist = (playlist_type, playlist_id) => {
    const key = getPlaylistObjectKey(playlist_type);
    if (key === '') {
      return;
    }
    const playlists = localStorage.getObject(key);
    if (playlists == null) {
      return;
    }
    const newplaylists = playlists.filter(
      /**
       * 筛选检查 playlists 中的条目，item 是否不等于 playlist_id。
       * @param item 来自 playlists 的当前条目。
       * @returns {boolean} item 是否不等于 playlist_id。
       */
      (item) => item !== playlist_id);
    localStorage.removeItem(playlist_id);
    localStorage.setObject(key, newplaylists);
  };

  /**
   * 把新增曲目放到歌单头部，按 ID 去重后持久化。
   * @param playlist_id 目标歌单 ID。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 concat 字段。
   * @returns {*} null；其他分支返回 歌单对象 playlist。
   */
  function add_track_to_myplaylist(playlist_id, track) {
    const playlist = localStorage.getObject(playlist_id);
    if (playlist == null) {
      return null;
    }
    // 新增曲目始终插入歌单开头。
    if (Array.isArray(track)) {
      playlist.tracks = track.concat(playlist.tracks);
    } else {
      playlist.tracks.unshift(track);
    }

    // 按曲目 ID 去重。
    const newTracks = [];
    const trackIds = [];

    playlist.tracks.forEach(
      /**
       * 逐项处理 playlist.tracks 中的条目，执行 trackIds.indexOf。
       * @param tracki 来自 playlist.tracks 的当前条目；使用 id 字段。
       * @returns {void} 无返回值。
       */
      (tracki) => {
      if (trackIds.indexOf(tracki.id) === -1) {
        newTracks.push(tracki);
        trackIds.push(tracki.id);
      }
    });
    playlist.tracks = newTracks;

    localStorage.setObject(playlist_id, playlist);
    return playlist;
  }

  /**
   * 移动已有曲目到目标前后，保持歌单内相对顺序。
   * @param playlist_id 目标歌单 ID。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 id 字段。
   * @param to_track 作为插入位置参照的目标曲目；使用 id 字段。
   * @param direction 插入或切换方向，使用调用方约定的前后标记。
   * @returns {*} null；其他分支返回 歌单对象 playlist。
   */
  function insert_track_to_myplaylist(playlist_id, track, to_track, direction) {
    const playlist = localStorage.getObject(playlist_id);
    if (playlist == null) {
      return null;
    }
    const index = playlist.tracks.findIndex(
      /**
       * 筛选检查 playlist.tracks 中的条目，i.id 是否严格等于 track.id。
       * @param i 来自 playlist.tracks 的当前条目；使用 id 字段。
       * @returns {boolean} i.id 是否严格等于 track.id。
       */
      (i) => i.id === track.id);
    let insertIndex = playlist.tracks.findIndex(
      /**
       * 筛选检查 playlist.tracks 中的条目，i.id 是否严格等于 to_track.id。
       * @param i 来自 playlist.tracks 的当前条目；使用 id 字段。
       * @returns {boolean} i.id 是否严格等于 to_track.id。
       */
      (i) => i.id === to_track.id);
    if (index === insertIndex) {
      return playlist;
    }
    if (insertIndex > index) {
      insertIndex -= 1;
    }
    const offset = direction === 'top' ? 0 : 1;
    array_move(playlist.tracks, index, insertIndex + offset);
    localStorage.setObject(playlist_id, playlist);
    return playlist;
  }

  /**
   * 按曲目 ID 过滤歌单并保存。
   * @param playlist_id 目标歌单 ID。
   * @param track_id 目标曲目 ID。
   * @returns {void} 无返回值。
   */
  function remove_track_from_myplaylist(playlist_id, track_id) {
    const playlist = localStorage.getObject(playlist_id);
    if (playlist == null) {
      return;
    }
    const newtracks = playlist.tracks.filter(
      /**
       * 筛选检查 playlist.tracks 中的条目，item.id 是否不等于 track_id。
       * @param item 来自 playlist.tracks 的当前条目；使用 id 字段。
       * @returns {boolean} item.id 是否不等于 track_id。
       */
      (item) => item.id !== track_id);
    playlist.tracks = newtracks;
    localStorage.setObject(playlist_id, playlist);
  }

  /**
   * 生成自建歌单结构并保存，收藏歌单通过克隆接口创建。
   * @param playlist_title 新歌单标题。
   * @param track 统一曲目对象，包含用于路由和查找的 ID。
   * @returns {void} 无返回值。
   */
  function create_myplaylist(playlist_title, track) {
    const playlist = {};

    const info = {
      cover_img_url: 'images/mycover.jpg',
      title: playlist_title,
      id: '',
      source_url: '',
    };

    playlist.is_mine = 1;
    playlist.info = info;

    if (Array.isArray(track)) {
      playlist.tracks = track;
    } else {
      playlist.tracks = [track];
    }

    // 创建接口仅用于自建歌单，收藏通过克隆接口生成。
    save_myplaylist('my', playlist);
  }

  /**
   * 更新歌单标题及封面地址后保存。
   * @param playlist_id 目标歌单 ID。
   * @param title 新的歌单标题。
   * @param cover_img_url 歌单封面地址。
   * @returns {void} 无返回值。
   */
  function edit_myplaylist(playlist_id, title, cover_img_url) {
    const playlist = localStorage.getObject(playlist_id);
    if (playlist == null) {
      return;
    }
    playlist.info.title = title;
    playlist.info.cover_img_url = cover_img_url;
    localStorage.setObject(playlist_id, playlist);
  }

  /**
   * 读取指定记录并检查 is_fav 标记，作为本地收藏存在性判断。
   * @param playlist_type 自建或收藏歌单分类。
   * @param list_id 目标歌单或列表 ID。
   * @returns {*} false；其他分支返回 歌单对象 playlist 是否不等于 null 且 playlist.is_fav。
   */
  function myplaylist_containers(playlist_type, list_id) {
    const key = getPlaylistObjectKey(playlist_type);
    if (key === '') {
      return false;
    }
    const playlist = localStorage.getObject(list_id);
    return playlist !== null && playlist.is_fav;
  }

  return {
    show_myplaylist,
    save_myplaylist,
    get_playlist: get_myplaylist,
    remove_myplaylist,
    add_track_to_myplaylist,
    remove_track_from_myplaylist,
    create_myplaylist,
    edit_myplaylist,
    myplaylist_containers,
    insert_track_to_myplaylist,
    insert_myplaylist_to_myplaylists,
  };
};

/**
 * myplaylist：本地自建和收藏歌单服务的单例；类型为 Object。
 * @type {Object}
 */
const myplaylist = myplaylistFactory(); // eslint-disable-line no-unused-vars
