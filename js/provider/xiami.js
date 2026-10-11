/**
 * 文件职责：保留虾米旧 ID 与接口形状，向现有歌单返回空曲目或失败结果，以兼容历史数据。
 *
 * 文件级定义：
 * - xiami：提供 xiami 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 * - xiami.show_playlist：保留虾米推荐入口，返回空列表。
 * - xiami.bootstrap_track：历史虾米曲目不再解析地址，直接调用失败回调。
 * - xiami.xm_get_playlist：按旧歌单 ID 构造元信息，曲目数组保持为空。
 * - xiami.xm_search：保留搜索类型并回传空结果和零总数。
 * - xiami.xm_album：按旧专辑 ID 构造元信息，曲目数组保持为空。
 * - xiami.xm_artist：按旧歌手 ID 构造元信息，曲目数组保持为空。
 * - xiami.lyric：回传空原文与空译文。
 * - xiami.parse_url：保留解析入口，通过回调返回 undefined。
 * - xiami.get_playlist：按列表 ID 前缀路由虾米历史数据的歌单、专辑或歌手详情。
 * - xiami.get_playlist_filters：当前没有提供筛选分类，通过回调返回空的 recommend 和 all 数组。
 * - xiami.get_user：当前没有实现用户资料查询，通过旧回调返回失败状态和空数据。
 * - xiami.get_login_url：返回虾米历史数据登录入口地址。
 * - xiami.logout：保留退出入口。
 */
/* eslint-disable radix */
/* eslint-disable no-use-before-define */
/* global getParameterByName */
/* eslint-disable no-param-reassign */
/**
 * 提供 xiami 的静态音乐来源接口，无需实例化；由 MediaService 按 ID 前缀路由调用。
 */
// eslint-disable-next-line no-unused-vars
class xiami {
  /**
   * 保留虾米推荐入口，返回空列表。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static show_playlist() {
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
   * 历史虾米曲目不再解析地址，直接调用失败回调。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；当前函数体未使用，保留调用签名。
   * @param success 接收成功业务结果的回调；当前函数体未使用，保留调用签名。
   * @param failure 接收失败原因的回调；省略时沿用声明中的默认处理。
   * @returns {void} 无返回值。
   */
  // eslint-disable-next-line no-unused-vars
  static bootstrap_track(track, success, failure) {
    const sound = {};
    failure(sound);
  }

  /**
   * 按旧歌单 ID 构造元信息，曲目数组保持为空。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static xm_get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_').pop();
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 tracks、info 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) =>
        fn({
          tracks: [],
          info: {
            cover_img_url: '',
            title: '',
            id: `xmplaylist_${list_id}`,
            source_url: `https://www.xiami.com/collect/${list_id}`,
          },
        }),
    };
  }

  /**
   * 保留搜索类型并回传空结果和零总数。
   * @param url 携带 type 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static xm_search(url) {
    const searchType = getParameterByName('type', url);

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

  /**
   * 按旧专辑 ID 构造元信息，曲目数组保持为空。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static xm_album(url) {
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 tracks、info 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => {
        const album_id = getParameterByName('list_id', url).split('_').pop();

        return fn({
          tracks: [],
          info: {
            cover_img_url: '',
            title: album_id,
            id: `xmalbum_${album_id}`,
            source_url: `https://www.xiami.com/album/${album_id}`,
          },
        });
      },
    };
  }

  /**
   * 按旧歌手 ID 构造元信息，曲目数组保持为空。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static xm_artist(url) {
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 tracks、info 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => {
        const artist_id = getParameterByName('list_id', url).split('_').pop();

        return fn({
          tracks: [],
          info: {
            cover_img_url: '',
            title: artist_id,
            id: `xmartist_${artist_id}`,
            source_url: `https://www.xiami.com/artist/${artist_id}`,
          },
        });
      },
    };
  }

  /**
   * 回传空原文与空译文。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static lyric() {
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 lyric、tlyric 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) =>
        fn({
          lyric: '',
          tlyric: '',
        }),
    };
  }

  /**
   * 保留解析入口，通过回调返回 undefined。
   * 无参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  static parse_url() {
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 undefined；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success: (fn) => {
        fn(undefined);
      },
    };
  }

  /**
   * 按列表 ID 前缀路由虾米历史数据的歌单、专辑或歌手详情；不支持的前缀返回 null。
   * @param url 携带 list_id 查询参数的内部请求地址。
   * @returns {*} this.xm_get_playlist 的调用结果；其他分支返回 this.xm_album 的调用结果；其他分支返回 this.xm_artist 的调用结果；其他分支返回 null。
   */
  static get_playlist(url) {
    const list_id = getParameterByName('list_id', url).split('_')[0];
    switch (list_id) {
      case 'xmplaylist':
        return this.xm_get_playlist(url);
      case 'xmalbum':
        return this.xm_album(url);
      case 'xmartist':
        return this.xm_artist(url);
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
   * 返回虾米历史数据登录入口地址。
   * 无参数。
   * @returns {string} 按当前字段拼接的字符串。
   */
  static get_login_url() {
    return `https://www.xiami.com`;
  }

  /**
   * 保留退出入口；当前函数体为空，不修改认证状态。
   * 无参数。
   * @returns {void} 无返回值。
   */
  static logout() {}

  // 停用代码，保留供历史对照：
  // return {
  //   show_playlist: xm_show_playlist,
  //   get_playlist_filters,
  //   get_playlist,
  //   parse_url: xm_parse_url,
  //   bootstrap_track: xm_bootstrap_track,
  //   search: xm_search,
  //   lyric: xm_lyric,
  //   get_user: xm_get_user,
  //   get_login_url: xm_get_login_url,
  //   logout: xm_logout,
  // };
}
