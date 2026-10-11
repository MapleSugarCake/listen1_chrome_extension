/**
 * 文件职责：集中注册音乐来源，向控制器提供统一搜索、歌单、歌词、认证和播放地址服务，管理取消、缓存与备用来源。
 *
 * 文件级定义：
 * - PROVIDERS：按名称和 ID 前缀注册的音乐来源及能力标记。
 * - getProviderByName：按来源名称查找注册项并取得提供者。
 * - getAllProviders：筛除隐藏来源，返回可见来源的实现对象数组。
 * - getProviderNameByItemId：从条目 ID 的前两字符查找来源名称。
 * - getProviderByItemId：按条目 ID 前缀取得对应提供者。
 * - playlistCache：外部歌单的限时 LRU 缓存，自建与本地歌单绕过此缓存。
 * - queryStringify：将选项转换为查询字符串，供仍接受 URL 参数的旧接口使用。
 * - providerParseUrl：把提供者的旧链接解析回调转换为 Promise，保留统一请求的错误及超时处理。
 * - resolveFirstDefined：等待首个非 undefined 的成功结果。
 * - buildBootstrapTrackSearchOptions：按原标题和歌手构造第一页歌曲搜索参数，供备用来源查找。
 * - isSameBootstrapCandidate：比较标题与歌手，并检查候选的 disable 标记，避免备用来源匹配到明显不同的曲目。
 * - MediaService：控制器使用的跨来源业务门面。
 * - MediaService.getLoginProviders：筛选可见且支持登录的来源注册项，保留名称、实现对象及能力字段。
 * - MediaService.search：搜索单一或全部来源，统一总数与 hasMore。
 * - MediaService.showMyPlaylist：通过本地歌单存储读取自建歌单列表。
 * - MediaService.showPlaylistArray：按来源、偏移和筛选条件请求热门歌单。
 * - MediaService.getPlaylistFilters：请求指定来源的推荐及完整歌单分类。
 * - MediaService.getLyric：按曲目 ID 路由歌词请求，保留专辑及原文、译文地址参数。
 * - MediaService.showFavPlaylist：读取本地收藏歌单索引。
 * - MediaService.queryPlaylist：查询指定歌单是否已存在于对应本地列表。
 * - MediaService.getPlaylist：按 ID 获取歌单，外部歌单使用限时缓存，本地和自建歌单直接读取。
 * - MediaService.clonePlaylist：读取远程歌单后保存为自建或收藏记录，并通过旧 success 协议通知完成。
 * - MediaService.removeMyPlaylist：删除本地歌单记录及有序索引项。
 * - MediaService.addMyPlaylist：向自建歌单添加曲目，沿用本地去重与前插规则。
 * - MediaService.insertTrackToMyPlaylist：在自建歌单的目标曲目前后插入或移动曲目。
 * - MediaService.addPlaylist：按 ID 路由新增曲目的歌单操作。
 * - MediaService.removeTrackFromMyPlaylist：从自建歌单删除指定曲目。
 * - MediaService.removeTrackFromPlaylist：按来源路由歌单曲目删除。
 * - MediaService.createMyPlaylist：创建带初始曲目的自建歌单。
 * - MediaService.insertMyplaylistToMyplaylists：在指定自建或收藏歌单索引中按相对方向移动歌单。
 * - MediaService.editMyPlaylist：修改自建歌单标题和封面。
 * - MediaService.parseURL：并行尝试来源的链接解析，返回首个有效匹配。
 * - MediaService.mergePlaylist：读取源和目标歌单，将目标中源列表尚未包含的曲目加入源歌单。
 * - MediaService.bootstrapTrack：先向原来源请求地址，失败后按设置并行搜索备用来源。
 * - MediaService.login：将登录选项编码后交给指定来源。
 * - MediaService.getUser：请求来源当前用户资料。
 * - MediaService.getLoginUrl：取得来源登录入口地址。
 * - MediaService.getUserCreatedPlaylist：请求当前用户创建的歌单。
 * - MediaService.getUserFavoritePlaylist：请求当前用户收藏的歌单。
 * - MediaService.getRecommendPlaylist：请求当前来源的推荐歌单。
 * - MediaService.logout：调用来源的退出逻辑以清理相应认证状态。
 * - loWeb：保留的媒体服务兼容别名。
 */
/* global RequestTask LRUCache setPrototypeOfLocalStorage getLocalStorageValue */
/* global netease xiami qq kugou kuwo bilibili migu taihe localmusic myplaylist */

/**
 * PROVIDERS：按名称和 ID 前缀注册的音乐来源及能力标记；类型为 Array。
 * @type {Array}
 */
const PROVIDERS = [
  {
    name: 'netease',
    instance: netease,
    searchable: true,
    support_login: true,
    id: 'ne',
  },
  {
    name: 'xiami',
    instance: xiami,
    searchable: false,
    hidden: true,
    support_login: false,
    id: 'xm',
  },
  {
    name: 'qq',
    instance: qq,
    searchable: true,
    support_login: true,
    id: 'qq',
  },
  {
    name: 'kugou',
    instance: kugou,
    searchable: true,
    support_login: false,
    id: 'kg',
  },
  {
    name: 'kuwo',
    instance: kuwo,
    searchable: true,
    support_login: false,
    id: 'kw',
  },
  {
    name: 'bilibili',
    instance: bilibili,
    searchable: true,
    support_login: false,
    id: 'bi',
  },
  {
    name: 'migu',
    instance: migu,
    searchable: true,
    support_login: true,
    id: 'mg',
  },
  {
    name: 'taihe',
    instance: taihe,
    searchable: true,
    support_login: false,
    id: 'th',
  },
  {
    name: 'localmusic',
    instance: localmusic,
    searchable: false,
    hidden: true,
    support_login: false,
    id: 'lm',
  },
  {
    name: 'myplaylist',
    instance: myplaylist,
    searchable: false,
    hidden: true,
    support_login: false,
    id: 'my',
  },
];

// 条目 ID 使用 ne、qq、kw 等双字符前缀，
// 此注册表统一决定搜索、歌单、歌词、登录
// 及备用播放请求的路由。
/**
 * 按来源名称查找注册项并取得提供者。
 * @param sourceName 音乐来源注册名称。
 * @returns {*} PROVIDERS.find((i) => i.name === sourceName) || {}.instance。
 */
function getProviderByName(sourceName) {
  return (
    PROVIDERS.find(
      /**
       * 筛选检查 PROVIDERS 中的条目，i.name 是否严格等于 sourceName。
       * @param i 来自 PROVIDERS 的当前条目；使用 name 字段。
       * @returns {boolean} i.name 是否严格等于 sourceName。
       */
      (i) => i.name === sourceName
    ) || {}
  ).instance;
}

/**
 * 筛除隐藏来源，返回可见来源的实现对象数组。
 * 无参数。
 * @returns {Array} 逐项转换后的数组。
 */
function getAllProviders() {
  return PROVIDERS.filter(
    /**
     * 筛选检查 PROVIDERS 中的条目，对 i.hidden 取反的布尔值。
     * @param i 来自 PROVIDERS 的当前条目；使用 hidden 字段。
     * @returns {boolean} 对 i.hidden 取反的布尔值。
     */
    (i) => !i.hidden
  ).map(
    /**
     * 转换 PROVIDERS.filter() 中的条目，i.instance。
     * @param i 来自 PROVIDERS.filter() 的当前条目；使用 instance 字段。
     * @returns {*} i.instance。
     */
    (i) => i.instance
  );
}

/**
 * 从条目 ID 的前两字符查找来源名称。
 * @param itemId 带两字符来源前缀的曲目或列表 ID。
 * @returns {*} PROVIDERS.find((i) => i.id === prefix) || {}.name。
 */
function getProviderNameByItemId(itemId) {
  const prefix = itemId.slice(0, 2);
  return (
    PROVIDERS.find(
      /**
       * 筛选检查 PROVIDERS 中的条目，i.id 是否严格等于 prefix。
       * @param i 来自 PROVIDERS 的当前条目；使用 id 字段。
       * @returns {boolean} i.id 是否严格等于 prefix。
       */
      (i) => i.id === prefix
    ) || {}
  ).name;
}

/**
 * 按条目 ID 前缀取得对应提供者。
 * @param itemId 带两字符来源前缀的曲目或列表 ID。
 * @returns {*} PROVIDERS.find((i) => i.id === prefix) || {}.instance。
 */
function getProviderByItemId(itemId) {
  const prefix = itemId.slice(0, 2);
  return (
    PROVIDERS.find(
      /**
       * 筛选检查 PROVIDERS 中的条目，i.id 是否严格等于 prefix。
       * @param i 来自 PROVIDERS 的当前条目；使用 id 字段。
       * @returns {boolean} i.id 是否严格等于 prefix。
       */
      (i) => i.id === prefix
    ) || {}
  ).instance;
}

/* 缓存外部来源的歌单，自建和本地歌单不进入此缓存。 */
/**
 * playlistCache：外部歌单的限时 LRU 缓存，自建与本地歌单绕过此缓存；类型为 LRUCache。
 * @type {LRUCache}
 */
const playlistCache = new LRUCache({
  max: 100,
  ttl: 60 * 60 * 1000,
});

/**
 * 将选项转换为查询字符串，供仍接受 URL 参数的旧接口使用。
 * @param options 本次操作选项。
 * @returns {string} 经过 URL 编码的查询参数字符串。
 */
function queryStringify(options) {
  const query = JSON.parse(JSON.stringify(options));
  return new URLSearchParams(query).toString();
}

// 来源的 parse_url 保留旧 success(fn) 协议，
// 这里转换为 Promise 并等待首个有效匹配，
// 无需改变 MediaService 对外接口。
/**
 * 把提供者的旧链接解析回调转换为 Promise，保留统一请求的错误及超时处理。
 * @param provider 音乐来源的静态接口对象；使用 parse_url 字段。
 * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
 * @returns {*} RequestTask.legacy().promise。
 */
function providerParseUrl(provider, url) {
  return RequestTask.legacy(
    /**
     * 进入此回调后，执行 provider.parse_url。
     * 无参数。
     * @returns {*} provider.parse_url 的调用结果。
     */
    () => provider.parse_url(url),
    {
      stage: 'parseURL',
    }
  ).promise;
}

/**
 * 等待首个非 undefined 的成功结果；忽略拒绝及空结果，全部无匹配时才以 undefined 完成。
 * @param promises 需要等待首个有效结果的一组 Promise。
 * @returns {Promise<*>} 首个非 undefined 的成功结果；全部拒绝或空结果时为 undefined。
 */
function resolveFirstDefined(promises) {
  return new Promise(
    /**
     * 启动当前异步操作，调用 resolve，依次传入 undefined，由 resolve／reject 决定 Promise 的结果。
     * @param resolve 用于兑现当前 Promise 的函数。
     * @returns {void} 无返回值。
     */
    (resolve) => {
      if (promises.length === 0) {
        resolve(undefined);
        return;
      }

      let pending = promises.length;
      let settled = false;

      promises.forEach(
        /**
         * 逐项处理 promises 中的条目，执行 promise.then().catch。
         * @param promise 来自 promises 的当前条目。
         * @returns {void} 无返回值。
         */
        (promise) => {
          promise
            .then(
              /**
               * 上一步异步操作完成后，更新 pending、settled，调用 resolve，依次传入 value。
               * @param value 待检查或转换的输入值。
               * @returns {void} 无返回值。
               */
              (value) => {
                pending -= 1;
                if (!settled && value !== undefined) {
                  settled = true;
                  resolve(value);
                  return;
                }
                if (!settled && pending === 0) {
                  resolve(undefined);
                }
              }
            )
            .catch(
              /**
               * 异步操作失败后，更新 pending，调用 resolve，依次传入 undefined。
               * 无参数。
               * @returns {void} 无返回值。
               */
              () => {
                pending -= 1;
                if (!settled && pending === 0) {
                  resolve(undefined);
                }
              }
            );
        }
      );
    }
  );
}

/**
 * 按原标题和歌手构造第一页歌曲搜索参数，供备用来源查找。
 * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 title、artist 字段。
 * @returns {Object} 包含关键词、第一页页码及歌曲搜索类型的选项。
 */
function buildBootstrapTrackSearchOptions(track) {
  // 备用来源匹配保留原标题和歌手约束，
  // 减少不同来源搜索到同名但不同版本的歌曲。
  return {
    keywords: `${track.title} ${track.artist}`,
    curpage: 1,
    type: 0,
  };
}

/**
 * 比较标题与歌手，并检查候选的 disable 标记，避免备用来源匹配到明显不同的曲目。
 * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 title、artist 字段。
 * @param searchTrack 备用来源搜索得到的候选曲目；使用 disable、title、artist 字段。
 * @returns {boolean} 候选是否满足现有标题、歌手与 disable 标记条件。
 */
function isSameBootstrapCandidate(track, searchTrack) {
  return (
    !searchTrack.disable &&
    searchTrack.title === track.title &&
    searchTrack.artist === track.artist
  );
}

setPrototypeOfLocalStorage();

/**
 * MediaService：控制器使用的跨来源业务门面；类型为 Object。
 * @type {Object}
 */
const MediaService = {
  /**
   * 筛选可见且支持登录的来源注册项，保留名称、实现对象及能力字段。
   * 无参数。
   * @returns {Array} 符合筛选条件的条目数组。
   */
  getLoginProviders() {
    return PROVIDERS.filter(
      /**
       * 筛选检查 PROVIDERS 中的条目，对 i.hidden 取反的布尔值 且 i.support_login。
       * @param i 来自 PROVIDERS 的当前条目；使用 hidden、support_login 字段。
       * @returns {*} 对 i.hidden 取反的布尔值 且 i.support_login。
       */
      (i) => !i.hidden && i.support_login
    );
  },
  /**
   * 搜索单一或全部来源，统一总数与 hasMore；聚合搜索逐步广播分来源状态，按来源和 ID 去重并支持取消。
   * @param source 音乐来源名称。
   * @param options 本次操作选项；使用 type、curpage 字段。
   * @returns {Object} 可取消的 RequestTask，成功和进度结果包含 result、total、hasMore 及来源状态。
   */
  search(source, options) {
    const url = `/search?${queryStringify(options)}`;
    if (source !== 'allmusic') {
      return RequestTask.create(
        /**
         * 进入此回调后，更新 total，调用 reject，依次传入 包含 code 的对象。
         * @param options 解构参数，包含 resolve（用于兑现当前 Promise 的函数）、reject（用于拒绝当前 Promise 的函数）、onCleanup（登记任务结算时调用的无参数清理函数）。
         * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
         */
        async ({ resolve, reject, onCleanup }) => {
          const provider = getProviderByName(source);
          if (!provider?.search) {
            reject({ code: 'UNSUPPORTED' });
            return;
          }
          const task = RequestTask.legacy(
            /**
             * 进入此回调后，执行 provider.search。
             * @param context 请求任务提供的执行上下文，包含取消信号或结算入口。
             * @returns {*} provider.search 的调用结果。
             */
            (context) => provider.search(url, context),
            { source, stage: 'search' }
          );
          onCleanup(
            /**
             * 进入此回调后，执行 task.cancel。
             * 无参数。
             * @returns {*} task.cancel 的调用结果。
             */
            () => task.cancel()
          );
          const data = await task.promise;
          if (!Array.isArray(data?.result)) {
            reject({ code: 'INVALID_RESPONSE' });
            return;
          }
          const pageSizes = {
            qq: 50,
            bilibili: 42,
            kuwo: Number(options.type) === 1 ? 30 : 20,
          };
          const pageSize = data.pageSize || pageSizes[source] || 20;
          const rawCount = data.result.length;
          const seen = new Set();
          const result = data.result.filter((track) => {
            const key = `${track.source}:${track.id}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          if (result.length !== rawCount)
            RequestTask.diagnose({
              source,
              stage: 'search',
              endpoint: 'search',
              duplicates: rawCount - result.length,
              count: rawCount,
            });
          const rawTotal = Number(data.total);
          let total = Number.isFinite(rawTotal) ? rawTotal : null;
          if (data.total == null || (source === 'migu' && rawTotal === 1000))
            total = null;
          resolve({
            ...data,
            result,
            type: options.type,
            pageSize,
            total,
            hasMore:
              data.hasMore ??
              (total === null
                ? rawCount >= pageSize
                : Number(options.curpage) * pageSize < total),
          });
        },
        { source, stage: 'search', endpoint: 'search', timeout: 15100 }
      );
    }
    return RequestTask.create(
      /**
       * 进入此回调后，调用 resolve，依次传入 snapshot 的调用结果。
       * @param options 解构参数，包含 resolve（用于兑现当前 Promise 的函数）、progress（发布当前任务阶段结果的进度通知函数）、onCleanup（登记任务结算时调用的无参数清理函数）。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async ({ resolve, progress, onCleanup }) => {
        const providers = PROVIDERS.filter(
          /**
           * 筛选检查 PROVIDERS 中的条目，item.searchable。
           * @param item 来自 PROVIDERS 的当前条目；使用 searchable 字段。
           * @returns {*} item.searchable。
           */
          (item) => item.searchable
        );
        const result = [];
        const seen = new Set();
        const sources = {};
        providers.forEach(
          /**
           * 逐项处理 providers 中的条目，更新 sources[name]。
           * @param options 来自 providers 的当前条目；解构参数，包含 name（待查找或注册的名称）。
           * @returns {void} 无返回值。
           */
          ({ name }) => {
            sources[name] = { state: 'pending' };
          }
        );
        /**
         * 生成当前聚合搜索的独立快照，保留来源状态、累计曲目和分页信息。
         * 无参数。
         * @returns {Object} 包含 result、total、type、sources、hasMore、pageSize 的对象。
         */
        const snapshot = () => ({
          result: [...result],
          total: null,
          type: options.type,
          sources: { ...sources },
          hasMore: Object.values(sources).some(
            /**
             * 筛选检查 Object.values() 中的条目，item.hasMore。
             * @param item 来自 Object.values() 的当前条目；使用 hasMore 字段。
             * @returns {*} item.hasMore。
             */
            (item) => item.hasMore
          ),
          pageSize: null,
        });
        progress(snapshot());
        await Promise.all(
          providers.map(
            /**
             * 转换 providers 中的条目，更新 sources[name]，执行 this.search。
             * @param options 来自 providers 的当前条目；解构参数，包含 name（待查找或注册的名称）。
             * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
             */
            async ({ name }) => {
              const task = this.search(name, options);
              onCleanup(
                /**
                 * 进入此回调后，执行 task.cancel。
                 * 无参数。
                 * @returns {*} task.cancel 的调用结果。
                 */
                () => task.cancel()
              );
              try {
                const data = await task.promise;
                data.result.forEach(
                  /**
                   * 逐项处理 data.result 中的条目，执行 seen.has。
                   * @param track 来自 data.result 的当前条目；使用 source、id 字段。
                   * @returns {void} 无返回值。
                   */
                  (track) => {
                    const key = `${track.source}:${track.id}`;
                    if (!seen.has(key)) {
                      seen.add(key);
                      result.push(track);
                    }
                  }
                );
                sources[name] = {
                  state: data.result.length ? 'success' : 'empty',
                  count: data.result.length,
                  hasMore: data.hasMore,
                };
              } catch (error) {
                sources[name] = { state: 'error', code: error.code };
              }
              progress(snapshot());
            }
          )
        );
        resolve(snapshot());
      },
      { source, stage: 'search', timeout: 15500 }
    );
  },

  /**
   * 通过本地歌单存储读取自建歌单列表。
   * 无参数。
   * @returns {*} myplaylist.show_myplaylist 的调用结果。
   */
  showMyPlaylist() {
    return myplaylist.show_myplaylist('my');
  },

  /**
   * 按来源、偏移和筛选条件请求热门歌单。
   * @param source 音乐来源名称。
   * @param offset 从列表开头跳过的条目数量。
   * @param filter_id 歌单分类标识。
   * @returns {*} RequestTask.legacy 的调用结果。
   */
  showPlaylistArray(source, offset, filter_id) {
    const provider = getProviderByName(source);
    const url = `/show_playlist?${queryStringify({ offset, filter_id })}`;
    return RequestTask.legacy(
      /**
       * 进入此回调后，执行 provider.show_playlist。
       * 无参数。
       * @returns {*} provider.show_playlist 的调用结果。
       */
      () => provider.show_playlist(url),
      {
        source,
        stage: 'playlists',
      }
    );
  },

  /**
   * 请求指定来源的推荐及完整歌单分类。
   * @param source 音乐来源名称。
   * @returns {*} RequestTask.legacy 的调用结果。
   */
  getPlaylistFilters(source) {
    const provider = getProviderByName(source);
    return RequestTask.legacy(
      /**
       * 进入此回调后，执行 provider.get_playlist_filters。
       * 无参数。
       * @returns {*} provider.get_playlist_filters 的调用结果。
       */
      () => provider.get_playlist_filters(),
      {
        source,
        stage: 'filters',
      }
    );
  },

  /**
   * 按曲目 ID 路由歌词请求，保留专辑及原文、译文地址参数。
   * @param track_id 目标曲目 ID。
   * @param album_id 来源专辑 ID，供歌词接口按需使用。
   * @param lyric_url 来源返回的原文歌词下载地址。
   * @param tlyric_url 来源返回的译文歌词下载地址。
   * @param options 可选；original 为 true 时绕过桌面歌词替换。
   * @returns {Object} 保持 success/error/cancel/promise 协议的请求任务。
   */
  getLyric(track_id, album_id, lyric_url, tlyric_url, options = {}) {
    const replacement =
      window.listen1Desktop &&
      !options.original &&
      window.Lyrics?.getOverride(track_id);
    if (replacement)
      return RequestTask.create(({ resolve }) => resolve(replacement));
    const provider = getProviderByItemId(track_id);
    const url = `/lyric?${queryStringify({
      track_id,
      album_id,
      lyric_url,
      tlyric_url,
    })}`;
    const original = RequestTask.legacy(
      /**
       * 进入此回调后，执行 provider.lyric。
       * 无参数。
       * @returns {*} provider.lyric 的调用结果。
       */
      () => provider.lyric(url),
      {
        source: getProviderNameByItemId(track_id),
        stage: 'lyric',
      }
    );
    return RequestTask.create(
      ({ resolve, reject, signal, onCleanup }) => {
        onCleanup(() => original.cancel());
        original.promise.then((data) => {
          if (signal.aborted) return;
          const value = { ...data };
          if (value.lyric) {
            const source = getProviderNameByItemId(track_id);
            value.provenance =
              window.Lyrics?.provenance(value.provenance) ||
              (source !== 'localmusic'
                ? { kind: 'platform', platform: source }
                : undefined);
            window.Lyrics?.rememberOrigin(track_id, value.provenance);
          } else window.Lyrics?.rememberOrigin(track_id, null);
          resolve(value);
        }, reject);
      },
      { source: getProviderNameByItemId(track_id), stage: 'lyric' }
    );
  },

  /**
   * 保存本地曲目显示信息到本地库、歌单副本和持久队列。
   * @param trackId 本地曲目 ID。
   * @param metadata 歌名、歌手和专辑。
   * @returns {Object} 已验证的显示字段；存储失败抛出异常。
   */
  updateLocalTrack(trackId, metadata) {
    return localmusic.update_track(trackId, metadata);
  },

  /**
   * 读取本地收藏歌单索引。
   * @returns {*} myplaylist.show_myplaylist 的调用结果。
   */
  showFavPlaylist() {
    return myplaylist.show_myplaylist('favorite');
  },

  /**
   * 查询指定歌单是否已存在于对应本地列表。
   * @param listId 目标歌单或列表 ID。
   * @param type 当前查询或操作类型。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  queryPlaylist(listId, type) {
    const result = myplaylist.myplaylist_containers(type, listId);
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 包含 result 的对象；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn({ result }),
    };
  },

  /**
   * 按 ID 获取歌单，外部歌单使用限时缓存，本地和自建歌单直接读取；缓存结果复制后返回。
   * @param listId 目标歌单或列表 ID。
   * @param [useCache] 是否优先使用已有歌单缓存；默认值为 true。
   * @returns {Object} 统一请求任务；成功结果包含 info 和 tracks，失败或取消走错误通道。
   */
  getPlaylist(listId, useCache = true) {
    const provider = getProviderByItemId(listId);
    const url = `/playlist?${queryStringify({ list_id: listId })}`;
    let hit = null;
    if (useCache) {
      hit = playlistCache.get(listId);
    }

    if (hit) {
      return RequestTask.create(
        /**
         * 进入此回调后，调用 resolve，依次传入 hit。
         * @param options 解构参数，包含 resolve（用于兑现当前 Promise 的函数）。
         * @returns {*} resolve 回调的直接返回值。
         */
        ({ resolve }) => resolve(hit)
      );
    }
    const task = RequestTask.legacy(
      /**
       * 进入此回调后，执行 provider.get_playlist。
       * 无参数。
       * @returns {*} provider.get_playlist 的调用结果。
       */
      () => provider.get_playlist(url),
      {
        source: getProviderNameByItemId(listId),
        stage: 'playlist',
      }
    );
    task.success(
      /**
       * 进入此回调后，执行 Array.isArray。
       * @param playlist 包含 info 和 tracks 的歌单数据；使用 tracks 字段。
       * @returns {void} 无返回值。
       */
      (playlist) => {
        if (
          provider !== myplaylist &&
          provider !== localmusic &&
          Array.isArray(playlist?.tracks)
        )
          playlistCache.set(listId, playlist);
      }
    );
    return task;
  },

  /**
   * 读取远程歌单后保存为自建或收藏记录，并通过旧 success 协议通知完成。
   * @param id 目标条目的唯一标识。
   * @param type 当前查询或操作类型。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  clonePlaylist(id, type) {
    const provider = getProviderByItemId(id);
    const url = `/playlist?list_id=${id}`;
    return {
      /**
       * 登记或执行旧式成功入口，执行 provider.get_playlist().success；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success: (fn) => {
        provider.get_playlist(url).success(
          /**
           * 进入此回调后，调用 fn 完成通知。
           * @param data 本次处理或转发的业务数据。
           * @returns {void} 无返回值。
           */
          (data) => {
            myplaylist.save_myplaylist(type, data);
            fn();
          }
        );
      },
    };
  },

  /**
   * 删除本地歌单记录及有序索引项。
   * @param id 目标条目的唯一标识。
   * @param type 当前查询或操作类型。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  removeMyPlaylist(id, type) {
    myplaylist.remove_myplaylist(type, id);
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn 完成通知；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(),
    };
  },

  /**
   * 向自建歌单添加曲目，沿用本地去重与前插规则。
   * @param id 目标条目的唯一标识。
   * @param track 统一曲目对象，包含用于路由和查找的 ID。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  addMyPlaylist(id, track) {
    const newPlaylist = myplaylist.add_track_to_myplaylist(id, track);
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 newPlaylist；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(newPlaylist),
    };
  },
  /**
   * 在自建歌单的目标曲目前后插入或移动曲目。
   * @param id 目标条目的唯一标识。
   * @param track 统一曲目对象，包含用于路由和查找的 ID。
   * @param to_track 作为插入位置参照的目标曲目。
   * @param direction 插入或切换方向，使用调用方约定的前后标记。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  insertTrackToMyPlaylist(id, track, to_track, direction) {
    const newPlaylist = myplaylist.insert_track_to_myplaylist(
      id,
      track,
      to_track,
      direction
    );
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 newPlaylist；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(newPlaylist),
    };
  },
  /**
   * 按 ID 路由新增曲目的歌单操作。
   * @param id 目标条目的唯一标识。
   * @param tracks 保持来源或调用方顺序的曲目数组。
   * @returns {*} provider.add_playlist 的调用结果。
   */
  addPlaylist(id, tracks) {
    const provider = getProviderByItemId(id);
    return provider.add_playlist(id, tracks);
  },

  /**
   * 从自建歌单删除指定曲目。
   * @param id 目标条目的唯一标识。
   * @param track 统一曲目对象，包含用于路由和查找的 ID。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  removeTrackFromMyPlaylist(id, track) {
    myplaylist.remove_track_from_myplaylist(id, track);
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn 完成通知；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(),
    };
  },

  /**
   * 按来源路由歌单曲目删除。
   * @param id 目标条目的唯一标识。
   * @param track 统一曲目对象，包含用于路由和查找的 ID。
   * @returns {*} provider.remove_from_playlist 的调用结果。
   */
  removeTrackFromPlaylist(id, track) {
    const provider = getProviderByItemId(id);
    return provider.remove_from_playlist(id, track);
  },

  /**
   * 创建带初始曲目的自建歌单。
   * @param title 新的歌单标题。
   * @param track 统一曲目对象，包含用于路由和查找的 ID。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  createMyPlaylist(title, track) {
    myplaylist.create_myplaylist(title, track);
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn 完成通知；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success: (fn) => {
        fn();
      },
    };
  },
  /**
   * 在指定自建或收藏歌单索引中按相对方向移动歌单。
   * @param playlistType 自建或收藏歌单分类。
   * @param playlistId 目标歌单 ID。
   * @param toPlaylistId 重排时作为参照的歌单 ID。
   * @param direction 插入或切换方向，使用调用方约定的前后标记。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  insertMyplaylistToMyplaylists(
    playlistType,
    playlistId,
    toPlaylistId,
    direction
  ) {
    const newPlaylists = myplaylist.insert_myplaylist_to_myplaylists(
      playlistType,
      playlistId,
      toPlaylistId,
      direction
    );
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn，依次传入 newPlaylists；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(newPlaylists),
    };
  },
  /**
   * 修改自建歌单标题和封面。
   * @param id 目标条目的唯一标识。
   * @param title 新的歌单标题。
   * @param coverImgUrl 歌单封面地址。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  editMyPlaylist(id, title, coverImgUrl) {
    myplaylist.edit_myplaylist(id, title, coverImgUrl);
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn 完成通知；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(),
    };
  },

  /**
   * 并行尝试来源的链接解析，返回首个有效匹配；全部无匹配时通过回调给出空对象。
   * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  parseURL(url) {
    return {
      /**
       * 登记或执行旧式成功入口，执行 getAllProviders；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {void} 无返回值。
       */
      success: (fn) => {
        const providers = getAllProviders();
        resolveFirstDefined(
          providers.map(
            /**
             * 转换 providers 中的条目，providerParseUrl 的调用结果。
             * @param provider 来自 providers 的当前条目。
             * @returns {*} providerParseUrl 的调用结果。
             */
            (provider) => providerParseUrl(provider, url)
          )
        ).then(
          /**
           * 上一步异步操作完成后，调用 fn，依次传入 空对象。
           * @param result 前一步处理结果。
           * @returns {void} 无返回值。
           */
          (result) => {
            if (result === undefined) {
              fn({});
              return;
            }
            fn({ result });
          }
        );
      },
    };
  },

  /**
   * 读取源和目标歌单，将目标中源列表尚未包含的曲目加入源歌单。
   * @param source 音乐来源名称。
   * @param target 合并时提供待补充曲目的目标歌单 ID。
   * @returns {Object} 含 success 回调入口的旧式结果对象；业务数据在调用该入口后传出。
   */
  mergePlaylist(source, target) {
    const tarData = localStorage.getObject(target).tracks;
    const srcData = localStorage.getObject(source).tracks;
    tarData.forEach(
      /**
       * 逐项处理 tarData 中的条目，执行 srcData.find。
       * @param tarTrack 来自 tarData 的当前条目；使用 id 字段。
       * @returns {void} 无返回值。
       */
      (tarTrack) => {
        if (
          !srcData.find(
            /**
             * 筛选检查 srcData 中的条目，srcTrack.id 是否严格等于 tarTrack.id。
             * @param srcTrack 来自 srcData 的当前条目；使用 id 字段。
             * @returns {boolean} srcTrack.id 是否严格等于 tarTrack.id。
             */
            (srcTrack) => srcTrack.id === tarTrack.id
          )
        ) {
          myplaylist.add_track_to_myplaylist(source, tarTrack);
        }
      }
    );
    return {
      /**
       * 登记或执行旧式成功入口，调用 fn 完成通知；业务结果通过 fn 传出。
       * @param fn 接收处理结果的回调函数。
       * @returns {*} fn 回调的直接返回值。
       */
      success: (fn) => fn(),
    };
  },

  /**
   * 先向原来源请求地址，失败后按设置并行搜索备用来源；限制总超时并在结束时取消剩余任务，本地曲目不跨来源回退。
   * @param track 统一曲目对象，包含用于路由和查找的 ID；使用 source 字段。
   * @param playerSuccessCallback 接收解析后的播放地址和来源信息的成功回调。
   * @param playerFailCallback 全部解析方案失败时调用的播放器失败回调。
   * @returns {Object} 可取消的播放地址任务；同时通过播放器成功或失败回调传递结果，取消不会误报播放失败。
   */
  bootstrapTrack(track, playerSuccessCallback, playerFailCallback) {
    const task = RequestTask.create(
      /**
       * 进入此回调后，更新 originalError，调用 resolve，依次传入 等待 bootstrap 的调用结果 完成后的值。
       * @param options 解构参数，包含 resolve（用于兑现当前 Promise 的函数）、reject（用于拒绝当前 Promise 的函数）、signal（请求任务的 AbortSignal，供取消在途请求）、onCleanup（登记任务结算时调用的无参数清理函数）；使用 aborted 字段。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      async ({ resolve, reject, signal, onCleanup }) => {
        /**
         * 将候选曲目的地址解析包装为带取消和超时的任务，并拒绝缺少有效 URL 的结果。
         * @param candidate 当前等待的窗口或备用曲目候选；使用 source 字段。
         * @returns {*} operation.promise。
         */
        const bootstrap = (candidate) => {
          const operation = RequestTask.create(
            /**
             * 进入此回调后，调用 failure，依次传入 包含 code 的对象。
             * @param options 解构参数，包含 success（接收成功业务结果的回调）、failure（接收失败原因的回调；省略时沿用声明中的默认处理）、childSignal（当前子任务的 AbortSignal）。
             * @returns {void} 无返回值。
             */
            ({ resolve: success, reject: failure, signal: childSignal }) => {
              const provider = getProviderByName(candidate.source);
              if (!provider?.bootstrap_track) {
                failure({ code: 'UNSUPPORTED' });
                return;
              }
              provider.bootstrap_track(
                candidate,
                /**
                 * 进入此回调后，调用 failure，依次传入 包含 code 的对象。
                 * @param sound 含 url、platform 等字段的播放地址结果；使用 url、platform 字段。
                 * @returns {void} 无返回值。
                 */
                (sound) => {
                  if (!sound?.url || typeof sound.url !== 'string') {
                    failure({ code: 'RESOURCE_UNAVAILABLE' });
                    return;
                  }
                  success({
                    ...sound,
                    platform: sound.platform || candidate.source,
                  });
                },
                /**
                 * 进入此回调后，调用 failure，依次传入 按 error.code 选择的 error 或 包含 code 的对象。
                 * @param error 被捕获或传入的异常；使用 code 字段。
                 * @returns {*} failure 回调的直接返回值。
                 */
                (error) =>
                  failure(
                    error?.code ? error : { code: 'RESOURCE_UNAVAILABLE' }
                  ),
                { signal: childSignal }
              );
            },
            { source: candidate.source, stage: 'bootstrap' }
          );
          onCleanup(
            /**
             * 进入此回调后，执行 operation.cancel。
             * 无参数。
             * @returns {*} operation.cancel 的调用结果。
             */
            () => operation.cancel()
          );
          return operation.promise;
        };
        let originalError;
        try {
          resolve(await bootstrap(track));
          return;
        } catch (error) {
          originalError = error;
        }
        if (signal.aborted) return;
        if (
          track.source === 'localmusic' ||
          localStorage.getObject('enable_auto_choose_source') === false
        ) {
          reject(originalError);
          return;
        }
        const configured = getLocalStorageValue('auto_choose_source_list', [
          'kuwo',
          'qq',
          'migu',
        ]);
        const sources = [
          ...new Set(Array.isArray(configured) ? configured : []),
        ].filter(
          /**
           * 筛选检查 [ ...new Set(Array.isArray(configured) ? configured : []), ] 中的条目，name 是否不等于 track.source 且 getProviderByName().search。
           * @param name 来自 [ ...new Set(Array.isArray(configured) ? configured : []), ] 的当前条目。
           * @returns {*} name 是否不等于 track.source 且 getProviderByName().search。
           */
          (name) => name !== track.source && getProviderByName(name)?.search
        );
        try {
          const sound = await Promise.any(
            sources.map(
              /**
               * 转换 sources 中的条目，执行 this.search。
               * @param source 来自 sources 的当前条目。
               * @returns {Promise<*>} 异步完成后得到 bootstrap 的调用结果。
               */
              async (source) => {
                const search = this.search(
                  source,
                  buildBootstrapTrackSearchOptions(track)
                );
                onCleanup(
                  /**
                   * 进入此回调后，执行 search.cancel。
                   * 无参数。
                   * @returns {*} search.cancel 的调用结果。
                   */
                  () => search.cancel()
                );
                const data = await search.promise;
                if (signal.aborted)
                  throw Object.assign(new Error('Cancelled'), {
                    code: 'CANCELLED',
                  });
                const candidate = data.result.find(
                  /**
                   * 筛选检查 data.result 中的条目，isSameBootstrapCandidate 的调用结果。
                   * @param item 来自 data.result 的当前条目。
                   * @returns {*} isSameBootstrapCandidate 的调用结果。
                   */
                  (item) => isSameBootstrapCandidate(track, item)
                );
                if (!candidate)
                  throw Object.assign(new Error('No matching track'), {
                    code: 'RESOURCE_UNAVAILABLE',
                  });
                return bootstrap(candidate);
              }
            )
          );
          resolve(sound);
        } catch {
          reject({ code: 'ALL_SOURCES_FAILED', originalError });
        }
      },
      { source: track.source, stage: 'bootstrap', timeout: 30000 }
    );
    task.success(playerSuccessCallback).error(
      /**
       * 进入此回调后，执行 playerFailCallback。
       * @param error 被捕获或传入的异常；使用 code 字段。
       * @returns {void} 无返回值。
       */
      (error) => {
        if (error.code !== 'CANCELLED') playerFailCallback(error);
      }
    );
    return task;
  },

  /**
   * 将登录选项编码后交给指定来源。
   * @param source 音乐来源名称。
   * @param options 本次操作选项。
   * @returns {*} RequestTask.legacy 的调用结果。
   */
  login(source, options) {
    const url = `/login?${queryStringify(options)}`;
    const provider = getProviderByName(source);

    return RequestTask.legacy(
      /**
       * 进入此回调后，执行 provider.login。
       * 无参数。
       * @returns {*} provider.login 的调用结果。
       */
      () => provider.login(url),
      {
        source,
        stage: 'login',
      }
    );
  },
  /**
   * 请求来源当前用户资料。
   * @param source 音乐来源名称。
   * @returns {*} RequestTask.legacy 的调用结果。
   */
  getUser(source) {
    const provider = getProviderByName(source);
    return RequestTask.legacy(
      /**
       * 进入此回调后，执行 provider.get_user。
       * 无参数。
       * @returns {*} provider.get_user 的调用结果。
       */
      (context) => provider.get_user(context),
      {
        source,
        stage: 'user',
        endpoint: 'user',
      }
    );
  },
  /**
   * 取得来源登录入口地址。
   * @param source 音乐来源名称。
   * @returns {*} provider.get_login_url 的调用结果。
   */
  getLoginUrl(source) {
    const provider = getProviderByName(source);
    return provider.get_login_url();
  },
  /**
   * 请求当前用户创建的歌单。
   * @param source 音乐来源名称。
   * @param options 本次操作选项。
   * @returns {*} RequestTask.legacy 的调用结果。
   */
  getUserCreatedPlaylist(source, options) {
    const provider = getProviderByName(source);
    const url = `/get_user_create_playlist?${queryStringify(options)}`;

    return RequestTask.legacy(
      /**
       * 进入此回调后，执行 provider.get_user_created_playlist。
       * 无参数。
       * @returns {*} provider.get_user_created_playlist 的调用结果。
       */
      (context) => provider.get_user_created_playlist(url, context),
      {
        source,
        stage: 'playlists',
        endpoint: 'created-playlists',
      }
    );
  },
  /**
   * 请求当前用户收藏的歌单。
   * @param source 音乐来源名称。
   * @param options 本次操作选项。
   * @returns {*} RequestTask.legacy 的调用结果。
   */
  getUserFavoritePlaylist(source, options) {
    const provider = getProviderByName(source);
    const url = `/get_user_favorite_playlist?${queryStringify(options)}`;

    return RequestTask.legacy(
      /**
       * 进入此回调后，执行 provider.get_user_favorite_playlist。
       * 无参数。
       * @returns {*} provider.get_user_favorite_playlist 的调用结果。
       */
      (context) => provider.get_user_favorite_playlist(url, context),
      {
        source,
        stage: 'playlists',
        endpoint: 'favorite-playlists',
      }
    );
  },
  /**
   * 请求当前来源的推荐歌单。
   * @param source 音乐来源名称。
   * @returns {Object} 支持成功、失败、取消和 Promise 的请求任务。
   */
  getRecommendPlaylist(source) {
    const provider = getProviderByName(source);

    return RequestTask.legacy(
      (context) => {
        if (!provider?.get_recommend_playlist)
          throw Object.assign(new Error('Unsupported operation'), {
            code: 'UNSUPPORTED',
          });
        return provider.get_recommend_playlist(context);
      },
      { source, stage: 'playlists', endpoint: 'recommend-playlists' }
    );
  },
  /**
   * 调用来源的退出逻辑以清理相应认证状态。
   * @param source 音乐来源名称。
   * @returns {*} provider.logout 的调用结果。
   */
  logout(source) {
    const provider = getProviderByName(source);

    return provider.logout();
  },
};

/**
 * loWeb：保留的媒体服务兼容别名；类型为 Object。
 * @type {Object}
 */
// eslint-disable-next-line no-unused-vars
const loWeb = MediaService;
