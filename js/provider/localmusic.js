/**
 * 文件职责：将本地曲目存储适配为音乐来源接口，按歌手和专辑筛选，并通过桌面桥恢复真实文件 URL。
 *
 * 文件级定义：
 * - defaultLocalMusicPlaylist：本地音乐保留歌单模板，每次读取缺省值时深复制。
 * - cloneDefaultLocalMusicPlaylist：深复制默认本地歌单，避免后续筛选和写入污染共享模板。
 * - getStoredLocalPlaylist：读取指定本地歌单，不存在时返回独立的默认歌单。
 * - buildFilteredLocalPlaylist：读取本地曲目，按歌手或专辑字段筛选，并以筛选值作为列表标题。
 * - localmusic：提供 localmusic 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 * - localmusic.show_playlist：本地来源不提供在线推荐列表，通过 success 返回空结果。
 * - localmusic.lm_get_playlist：读取本地音乐歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
 * - localmusic.lm_album：读取本地音乐专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
 * - localmusic.lm_artist：读取本地音乐歌手资料与接口提供的歌曲列表，转换为统一列表详情。
 * - localmusic.bootstrap_track：桌面环境按旧曲目 ID 恢复编码后的文件 URL。
 * - localmusic.lyric：从本地歌单查找曲目并取第一份歌词，缺失曲目或歌词时返回空文本。
 * - localmusic.add_playlist：解析可为 JSON 字符串的曲目数组，把尚未存在的新曲目前插，保留既有记录与顺序，然后持久化。
 * - localmusic.parse_url：本地来源不解析分享链接，通过回调返回 undefined。
 * - localmusic.get_playlist：按列表 ID 前缀路由本地音乐的歌单、专辑或歌手详情。
 * - localmusic.remove_from_playlist：按 ID 移除本地曲目并保存。
 * - localmusic.get_playlist_filters：当前没有提供筛选分类，通过回调返回空的 recommend 和 all 数组。
 */

/* eslint-disable no-unused-vars */
/* global getParameterByName */
/**
 * defaultLocalMusicPlaylist：本地音乐保留歌单模板，每次读取缺省值时深复制；类型为 Object。
 * @type {Object}
 */
const defaultLocalMusicPlaylist = {
  tracks: [],
  info: {
    id: 'lmplaylist_reserve',
    cover_img_url: 'images/mycover.jpg',
    title: '本地音乐',
    source_url: '',
  },
};

// 本地音乐沿用远程来源的接口协议，
// 曲目保存在 localStorage，sound_url 指向选中的音频文件。
/**
 * 深复制默认本地歌单，避免后续筛选和写入污染共享模板。
 * 无参数。
 * @returns {Object} 独立的空本地歌单，修改它不会影响共享模板。
 */
function cloneDefaultLocalMusicPlaylist() {
  return JSON.parse(JSON.stringify(defaultLocalMusicPlaylist));
}

/**
 * 读取指定本地歌单，不存在时返回独立的默认歌单。
 * @param [listId] 目标歌单或列表 ID；默认值为 "lmplaylist_reserve"。
 * @returns {Object} 已保存的本地歌单，或默认歌单的独立副本。
 */
function getStoredLocalPlaylist(listId = 'lmplaylist_reserve') {
  return localStorage.getObject(listId) || cloneDefaultLocalMusicPlaylist();
}

/**
 * 读取本地曲目，按歌手或专辑字段筛选，并以筛选值作为列表标题。
 * @param field 筛选本地曲目时使用的字段名。
 * @param value 待检查或转换的输入值。
 * @returns {Object} 标题为筛选值且 tracks 仅含匹配曲目的歌单。
 */
function buildFilteredLocalPlaylist(field, value) {
  const playlist = getStoredLocalPlaylist();
  playlist.info.title = value;
  playlist.tracks = playlist.tracks.filter(
    /**
     * 筛选检查 playlist.tracks 中的条目，track[field] 是否严格等于 value。
     * @param track 来自 playlist.tracks 的当前条目。
     * @returns {boolean} track[field] 是否严格等于 value。
     */
    (track) => track[field] === value
  );
  return playlist;
}

/**
 * 提供 localmusic 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 */
class localmusic {
  /**
   * 本地来源不提供在线推荐列表，通过 success 返回空结果。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数；当前函数体未使用，保留调用签名。
   * @param hm 保留的旧接口参数，当前实现未使用；当前函数体未使用，保留调用签名。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static show_playlist(url, hm) {
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 result 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) =>
        fn({
          result: [],
        }),
    };
  }

  /**
   * 读取本地音乐歌单元信息及曲目，转换为统一的 info 和 tracks 响应。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lm_get_playlist(url) {
    const list_id = getParameterByName('list_id', url);
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 getStoredLocalPlaylist 的调用结果；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(getStoredLocalPlaylist(list_id)),
    };
  }

  /**
   * 读取本地音乐专辑详情及歌曲，保留专辑来源链接和统一曲目 ID。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lm_album(url) {
    const album = getParameterByName('list_id', url).slice('lmalbum_'.length);
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 buildFilteredLocalPlaylist 的调用结果；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(buildFilteredLocalPlaylist('album', album)),
    };
  }

  /**
   * 读取本地音乐歌手资料与接口提供的歌曲列表，转换为统一列表详情。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lm_artist(url) {
    const artist = getParameterByName('list_id', url).slice('lmartist_'.length);
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 buildFilteredLocalPlaylist 的调用结果；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(buildFilteredLocalPlaylist('artist', artist)),
    };
  }

  /**
   * 桌面环境按旧曲目 ID 恢复编码后的文件 URL；其他环境沿用保存的 sound_url。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 id、sound_url 字段。
   * @param success 接收成功业务结果的回调。
   * @param failure 接收失败原因的回调；省略时沿用声明中的默认处理。
   * @returns {void} 无返回值。
   */
  static bootstrap_track(track, success, failure) {
    if (window.listen1Desktop) {
      window.listen1Desktop
        .localFileUrl(track.id)
        .then(
          /**
           * 上一步异步操作完成后，调用 success，依次传入 包含 url、platform 的对象。
           * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
           * @returns {*} success 回调的直接返回值。
           */
          (url) => success({ url, platform: 'localmusic' })
        )
        .catch(failure);
      return;
    }
    const sound = {};
    sound.url = track.sound_url;
    sound.platform = 'localmusic';

    success(sound);
  }

  /**
   * 从本地歌单查找曲目并取第一份歌词，缺失曲目或歌词时返回空文本。
   * @param url 携带 track_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lyric(url) {
    const track_id = getParameterByName('track_id', url);
    const playlist = getStoredLocalPlaylist();
    const track = playlist.tracks.find(
      /**
       * 筛选检查 playlist.tracks 中的条目，item.id 是否严格等于 track_id。
       * @param item 来自 playlist.tracks 的当前条目；使用 id 字段。
       * @returns {boolean} item.id 是否严格等于 track_id。
       */
      (item) => item.id === track_id
    );
    let lyric = '';
    // 本地歌词是可选数据；曲目或歌词缺失时返回空响应，
    // 避免中断播放器视图更新。
    if (track && track.lyrics !== undefined) {
      [lyric] = track.lyrics;
    }
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 lyric、tlyric 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) =>
        fn({
          lyric,
          tlyric: '',
          ...(track?.lyric_provenance
            ? { provenance: track.lyric_provenance }
            : {}),
        }),
    };
  }

  /**
   * 解析可为 JSON 字符串的曲目数组，把尚未存在的新曲目前插，保留既有记录与顺序，然后持久化。
   * @param list_id 目标歌单或列表 ID。
   * @param tracks 保持来源或调用方顺序的曲目数组；使用 concat 字段。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static add_playlist(list_id, tracks) {
    const incoming = typeof tracks === 'string' ? JSON.parse(tracks) : tracks;
    const playlist = getStoredLocalPlaylist(list_id);
    const seen = new Set(playlist.tracks.map((track) => track.id));
    const additions = incoming.filter((track) => {
      if (seen.has(track.id)) return false;
      seen.add(track.id);
      return true;
    });
    playlist.tracks = additions.concat(playlist.tracks);
    localStorage.setObject(list_id, playlist);
    return { success: (fn) => fn({ list_id, playlist }) };
  }

  // Prepare every affected snapshot before writing. Roll back completed writes
  // on failure; UI/core metadata is published only after persistence succeeds.
  static update_track(trackId, input) {
    if (
      typeof trackId !== 'string' ||
      !trackId.startsWith('lmtrack_') ||
      typeof input.title !== 'string' ||
      !input.title.trim() ||
      typeof input.artist !== 'string' ||
      typeof input.album !== 'string'
    )
      throw Object.assign(new Error('Invalid local metadata'), {
        code: 'LOCAL_METADATA',
      });
    const fields = {
      title: input.title.trim(),
      artist: input.artist.trim(),
      album: input.album.trim(),
      artist_id: `lmartist_${input.artist.trim()}`,
      album_id: `lmalbum_${input.album.trim()}`,
    };
    if (input.cover_asset_id !== undefined) {
      if (
        typeof input.cover_asset_id !== 'string' ||
        !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(
          input.cover_asset_id
        ) ||
        typeof input.cover_file_name !== 'string' ||
        input.cover_file_name.length > 255 ||
        /[\\/]/.test(input.cover_file_name) ||
        [...input.cover_file_name].some((char) => char.charCodeAt(0) < 32) ||
        typeof input.img_url !== 'string' ||
        !input.img_url.startsWith('file:')
      )
        throw Object.assign(new Error('Invalid cover'), {
          code: 'COVER_INVALID',
        });
      Object.assign(fields, {
        cover_asset_id: input.cover_asset_id,
        cover_file_name: input.cover_file_name,
        img_url: input.img_url,
      });
    }
    const ids = localStorage.getObject('playerlists');
    const favorites = localStorage.getObject('favoriteplayerlists');
    const keys = new Set([
      'lmplaylist_reserve',
      'current-playing',
      ...(Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : []),
      ...(Array.isArray(favorites)
        ? favorites.filter((id) => typeof id === 'string')
        : []),
    ]);
    const changes = [];
    keys.forEach((key) => {
      const original = localStorage.getItem(key);
      const value = localStorage.getObject(key);
      const tracks = key === 'current-playing' ? value : value?.tracks;
      if (!Array.isArray(tracks)) return;
      let changed = false;
      tracks.forEach((track) => {
        if (track?.id === trackId) {
          Object.assign(track, fields);
          changed = true;
        }
      });
      if (changed)
        changes.push({ key, original, value: JSON.stringify(value) });
    });
    if (!changes.length)
      throw Object.assign(new Error('Local track not found'), {
        code: 'LOCAL_TRACK_MISSING',
      });
    const completed = [];
    try {
      changes.forEach((change) => {
        localStorage.setItem(change.key, change.value);
        completed.push(change);
      });
    } catch {
      completed
        .reverse()
        .forEach(({ key, original }) => localStorage.setItem(key, original));
      throw Object.assign(new Error('Metadata could not be saved'), {
        code: 'LYRIC_STORAGE',
      });
    }
    return fields;
  }

  /**
   * 本地来源不解析分享链接，通过回调返回 undefined。
   * @param url 保留的旧接口参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象。
   */
  static parse_url(url) {
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 undefined；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(undefined),
    };
  }

  /**
   * 按列表 ID 前缀路由本地音乐的歌单、专辑或歌手详情；不支持的前缀返回 null。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {*} this.lm_get_playlist 的调用结果；其他分支返回 this.lm_artist 的调用结果；其他分支返回 this.lm_album 的调用结果；其他分支返回 null。
   */
  static get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_')[0];
    switch (list_id) {
      case 'lmplaylist':
        return this.lm_get_playlist(url);
      case 'lmartist':
        return this.lm_artist(url);
      case 'lmalbum':
        return this.lm_album(url);
      default:
        return null;
    }
  }

  /**
   * 按 ID 移除本地曲目并保存；歌单不存在时直接结束。
   * @param list_id 目标歌单或列表 ID。
   * @param track_id 目标曲目 ID。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static remove_from_playlist(list_id, track_id) {
    const playlist = localStorage.getObject(list_id);
    if (playlist == null) {
      return;
    }
    const newtracks = playlist.tracks.filter(
      /**
       * 筛选检查 playlist.tracks 中的条目，item.id 是否不等于 track_id。
       * @param item 来自 playlist.tracks 的当前条目；使用 id 字段。
       * @returns {boolean} item.id 是否不等于 track_id。
       */
      (item) => item.id !== track_id
    );
    playlist.tracks = newtracks;
    localStorage.setObject(list_id, playlist);

    // eslint-disable-next-line consistent-return
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn 完成通知；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(),
    };
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

  // 停用代码，保留供历史对照：
  // return {
  //   show_playlist: lm_show_playlist,
  //   get_playlist_filters,
  //   get_playlist,
  //   parse_url: lm_parse_url,
  //   bootstrap_track: lm_bootstrap_track,
  //   search: lm_search,
  //   lyric: lm_lyric,
  //   add_playlist: lm_add_playlist,
  //   remove_from_playlist: lm_remove_from_playlist,
  // };
}
