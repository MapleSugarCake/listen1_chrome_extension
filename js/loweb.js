/* global RequestTask LRUCache setPrototypeOfLocalStorage getLocalStorageValue */
/* global netease xiami qq kugou kuwo bilibili migu taihe localmusic myplaylist */

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

// Provider item ids use a two-character prefix (`ne`, `qq`, `kw`, ...). Keep
// this registry as the single source of truth for routing search, playlist,
// lyric, login, and fallback playback requests.
function getProviderByName(sourceName) {
  return (PROVIDERS.find((i) => i.name === sourceName) || {}).instance;
}

function getAllProviders() {
  return PROVIDERS.filter((i) => !i.hidden).map((i) => i.instance);
}

function getProviderNameByItemId(itemId) {
  const prefix = itemId.slice(0, 2);
  return (PROVIDERS.find((i) => i.id === prefix) || {}).name;
}

function getProviderByItemId(itemId) {
  const prefix = itemId.slice(0, 2);
  return (PROVIDERS.find((i) => i.id === prefix) || {}).instance;
}

/* cache for all playlist request except myplaylist and localmusic */
const playlistCache = new LRUCache({
  max: 100,
  ttl: 60 * 60 * 1000,
});

function queryStringify(options) {
  const query = JSON.parse(JSON.stringify(options));
  return new URLSearchParams(query).toString();
}

// Provider parse_url functions use the legacy `{ success(fn) }` contract.
// Promisifying them makes it possible to race all providers without changing
// the public MediaService API.
function providerParseUrl(provider, url) {
  return RequestTask.legacy(() => provider.parse_url(url), {
    stage: 'parseURL',
  }).promise;
}

function resolveFirstDefined(promises) {
  return new Promise((resolve) => {
    if (promises.length === 0) {
      resolve(undefined);
      return;
    }

    let pending = promises.length;
    let settled = false;

    promises.forEach((promise) => {
      promise
        .then((value) => {
          pending -= 1;
          if (!settled && value !== undefined) {
            settled = true;
            resolve(value);
            return;
          }
          if (!settled && pending === 0) {
            resolve(undefined);
          }
        })
        .catch(() => {
          pending -= 1;
          if (!settled && pending === 0) {
            resolve(undefined);
          }
        });
    });
  });
}

function buildBootstrapTrackSearchOptions(track) {
  // Keep fallback search conservative: broad enough to find mirrors, but stable
  // enough that different providers still return the same title/artist first.
  return {
    keywords: `${track.title} ${track.artist}`,
    curpage: 1,
    type: 0,
  };
}

function isSameBootstrapCandidate(track, searchTrack) {
  return (
    !searchTrack.disable &&
    searchTrack.title === track.title &&
    searchTrack.artist === track.artist
  );
}

setPrototypeOfLocalStorage();

/**
 * Facade consumed by controllers. Provider methods intentionally return the
 * legacy chainable shape `{ success(fn) }`; keeping that shape here avoids
 * touching older Angular controller code while provider internals evolve.
 */

const MediaService = {
  getLoginProviders() {
    return PROVIDERS.filter((i) => !i.hidden && i.support_login);
  },
  search(source, options) {
    const url = `/search?${queryStringify(options)}`;
    if (source !== 'allmusic') {
      return RequestTask.create(
        async ({ resolve, reject, onCleanup }) => {
          const provider = getProviderByName(source);
          if (!provider?.search) {
            reject({ code: 'UNSUPPORTED' });
            return;
          }
          const task = RequestTask.legacy(
            (context) => provider.search(url, context),
            { source, stage: 'search' }
          );
          onCleanup(() => task.cancel());
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
          const rawTotal = Number(data.total);
          let total = Number.isFinite(rawTotal) ? rawTotal : null;
          if (data.total == null || (source === 'migu' && rawTotal === 1000))
            total = null;
          resolve({
            ...data,
            type: options.type,
            pageSize,
            total,
            hasMore:
              data.hasMore ??
              (total === null
                ? data.result.length >= pageSize
                : Number(options.curpage) * pageSize < total),
          });
        },
        { source, stage: 'search', timeout: 15100 }
      );
    }
    return RequestTask.create(
      async ({ resolve, progress, onCleanup }) => {
        const providers = PROVIDERS.filter((item) => item.searchable);
        const result = [];
        const seen = new Set();
        const sources = {};
        providers.forEach(({ name }) => {
          sources[name] = { state: 'pending' };
        });
        const snapshot = () => ({
          result: [...result],
          total: null,
          type: options.type,
          sources: { ...sources },
          hasMore: Object.values(sources).some((item) => item.hasMore),
          pageSize: null,
        });
        progress(snapshot());
        await Promise.all(
          providers.map(async ({ name }) => {
            const task = this.search(name, options);
            onCleanup(() => task.cancel());
            try {
              const data = await task.promise;
              data.result.forEach((track) => {
                const key = `${track.source}:${track.id}`;
                if (!seen.has(key)) {
                  seen.add(key);
                  result.push(track);
                }
              });
              sources[name] = {
                state: data.result.length ? 'success' : 'empty',
                count: data.result.length,
                hasMore: data.hasMore,
              };
            } catch (error) {
              sources[name] = { state: 'error', code: error.code };
            }
            progress(snapshot());
          })
        );
        resolve(snapshot());
      },
      { source, stage: 'search', timeout: 15500 }
    );
  },

  showMyPlaylist() {
    return myplaylist.show_myplaylist('my');
  },

  showPlaylistArray(source, offset, filter_id) {
    const provider = getProviderByName(source);
    const url = `/show_playlist?${queryStringify({ offset, filter_id })}`;
    return RequestTask.legacy(() => provider.show_playlist(url), {
      source,
      stage: 'playlists',
    });
  },

  getPlaylistFilters(source) {
    const provider = getProviderByName(source);
    return RequestTask.legacy(() => provider.get_playlist_filters(), {
      source,
      stage: 'filters',
    });
  },

  getLyric(track_id, album_id, lyric_url, tlyric_url) {
    const provider = getProviderByItemId(track_id);
    const url = `/lyric?${queryStringify({
      track_id,
      album_id,
      lyric_url,
      tlyric_url,
    })}`;
    return RequestTask.legacy(() => provider.lyric(url), {
      source: getProviderNameByItemId(track_id),
      stage: 'lyric',
    });
  },

  showFavPlaylist() {
    return myplaylist.show_myplaylist('favorite');
  },

  queryPlaylist(listId, type) {
    const result = myplaylist.myplaylist_containers(type, listId);
    return {
      success: (fn) => fn({ result }),
    };
  },

  getPlaylist(listId, useCache = true) {
    const provider = getProviderByItemId(listId);
    const url = `/playlist?list_id=${listId}`;
    let hit = null;
    if (useCache) {
      hit = playlistCache.get(listId);
    }

    if (hit) {
      return RequestTask.create(({ resolve }) => resolve(hit));
    }
    const task = RequestTask.legacy(() => provider.get_playlist(url), {
      source: getProviderNameByItemId(listId),
      stage: 'playlist',
    });
    task.success((playlist) => {
      if (
        provider !== myplaylist &&
        provider !== localmusic &&
        Array.isArray(playlist?.tracks)
      )
        playlistCache.set(listId, playlist);
    });
    return task;
  },

  clonePlaylist(id, type) {
    const provider = getProviderByItemId(id);
    const url = `/playlist?list_id=${id}`;
    return {
      success: (fn) => {
        provider.get_playlist(url).success((data) => {
          myplaylist.save_myplaylist(type, data);
          fn();
        });
      },
    };
  },

  removeMyPlaylist(id, type) {
    myplaylist.remove_myplaylist(type, id);
    return {
      success: (fn) => fn(),
    };
  },

  addMyPlaylist(id, track) {
    const newPlaylist = myplaylist.add_track_to_myplaylist(id, track);
    return {
      success: (fn) => fn(newPlaylist),
    };
  },
  insertTrackToMyPlaylist(id, track, to_track, direction) {
    const newPlaylist = myplaylist.insert_track_to_myplaylist(
      id,
      track,
      to_track,
      direction
    );
    return {
      success: (fn) => fn(newPlaylist),
    };
  },
  addPlaylist(id, tracks) {
    const provider = getProviderByItemId(id);
    return provider.add_playlist(id, tracks);
  },

  removeTrackFromMyPlaylist(id, track) {
    myplaylist.remove_track_from_myplaylist(id, track);
    return {
      success: (fn) => fn(),
    };
  },

  removeTrackFromPlaylist(id, track) {
    const provider = getProviderByItemId(id);
    return provider.remove_from_playlist(id, track);
  },

  createMyPlaylist(title, track) {
    myplaylist.create_myplaylist(title, track);
    return {
      success: (fn) => {
        fn();
      },
    };
  },
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
      success: (fn) => fn(newPlaylists),
    };
  },
  editMyPlaylist(id, title, coverImgUrl) {
    myplaylist.edit_myplaylist(id, title, coverImgUrl);
    return {
      success: (fn) => fn(),
    };
  },

  parseURL(url) {
    return {
      success: (fn) => {
        const providers = getAllProviders();
        resolveFirstDefined(
          providers.map((provider) => providerParseUrl(provider, url))
        ).then((result) => {
          if (result === undefined) {
            fn({});
            return;
          }
          fn({ result });
        });
      },
    };
  },

  mergePlaylist(source, target) {
    const tarData = localStorage.getObject(target).tracks;
    const srcData = localStorage.getObject(source).tracks;
    tarData.forEach((tarTrack) => {
      if (!srcData.find((srcTrack) => srcTrack.id === tarTrack.id)) {
        myplaylist.add_track_to_myplaylist(source, tarTrack);
      }
    });
    return {
      success: (fn) => fn(),
    };
  },

  bootstrapTrack(track, playerSuccessCallback, playerFailCallback) {
    const task = RequestTask.create(
      async ({ resolve, reject, signal, onCleanup }) => {
        const bootstrap = (candidate) => {
          const operation = RequestTask.create(
            ({ resolve: success, reject: failure, signal: childSignal }) => {
              const provider = getProviderByName(candidate.source);
              if (!provider?.bootstrap_track) {
                failure({ code: 'UNSUPPORTED' });
                return;
              }
              provider.bootstrap_track(
                candidate,
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
                (error) =>
                  failure(
                    error?.code ? error : { code: 'RESOURCE_UNAVAILABLE' }
                  ),
                { signal: childSignal }
              );
            },
            { source: candidate.source, stage: 'bootstrap' }
          );
          onCleanup(() => operation.cancel());
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
          (name) => name !== track.source && getProviderByName(name)?.search
        );
        try {
          const sound = await Promise.any(
            sources.map(async (source) => {
              const search = this.search(
                source,
                buildBootstrapTrackSearchOptions(track)
              );
              onCleanup(() => search.cancel());
              const data = await search.promise;
              if (signal.aborted)
                throw Object.assign(new Error('Cancelled'), {
                  code: 'CANCELLED',
                });
              const candidate = data.result.find((item) =>
                isSameBootstrapCandidate(track, item)
              );
              if (!candidate)
                throw Object.assign(new Error('No matching track'), {
                  code: 'RESOURCE_UNAVAILABLE',
                });
              return bootstrap(candidate);
            })
          );
          resolve(sound);
        } catch {
          reject({ code: 'ALL_SOURCES_FAILED', originalError });
        }
      },
      { source: track.source, stage: 'bootstrap', timeout: 30000 }
    );
    task.success(playerSuccessCallback).error((error) => {
      if (error.code !== 'CANCELLED') playerFailCallback(error);
    });
    return task;
  },

  login(source, options) {
    const url = `/login?${queryStringify(options)}`;
    const provider = getProviderByName(source);

    return RequestTask.legacy(() => provider.login(url), {
      source,
      stage: 'login',
    });
  },
  getUser(source) {
    const provider = getProviderByName(source);
    return RequestTask.legacy(() => provider.get_user(), {
      source,
      stage: 'user',
    });
  },
  getLoginUrl(source) {
    const provider = getProviderByName(source);
    return provider.get_login_url();
  },
  getUserCreatedPlaylist(source, options) {
    const provider = getProviderByName(source);
    const url = `/get_user_create_playlist?${queryStringify(options)}`;

    return RequestTask.legacy(() => provider.get_user_created_playlist(url), {
      source,
      stage: 'playlists',
    });
  },
  getUserFavoritePlaylist(source, options) {
    const provider = getProviderByName(source);
    const url = `/get_user_favorite_playlist?${queryStringify(options)}`;

    return RequestTask.legacy(() => provider.get_user_favorite_playlist(url), {
      source,
      stage: 'playlists',
    });
  },
  getRecommendPlaylist(source) {
    const provider = getProviderByName(source);

    return provider.get_recommend_playlist();
  },
  logout(source) {
    const provider = getProviderByName(source);

    return provider.logout();
  },
};

// eslint-disable-next-line no-unused-vars
const loWeb = MediaService;
