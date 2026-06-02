/* global async LRUCache setPrototypeOfLocalStorage getLocalStorageValue */
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

function getAllSearchProviders() {
  return PROVIDERS.filter((i) => i.searchable).map((i) => i.instance);
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
  maxAge: 60 * 60 * 1000, // 1 hour cache expire
});

function queryStringify(options) {
  const query = JSON.parse(JSON.stringify(options));
  return new URLSearchParams(query).toString();
}

function mergePlatformSearchResults(platformResultArray) {
  if (!platformResultArray.length) {
    return {
      result: [],
      total: 0,
      type: '',
    };
  }

  const result = {
    result: [],
    total: 1000,
    type: platformResultArray[0].type,
  };
  const maxLength = Math.max(
    ...platformResultArray.map((platformResult) => platformResult.result.length)
  );

  for (let index = 0; index < maxLength; index += 1) {
    platformResultArray.forEach((platformResult) => {
      if (index < platformResult.result.length) {
        result.result.push(platformResult.result[index]);
      }
    });
  }

  return result;
}

// Provider parse_url functions use the legacy `{ success(fn) }` contract.
// Promisifying them makes it possible to race all providers without changing
// the public MediaService API.
function providerParseUrl(provider, url) {
  return new Promise((resolve) => {
    provider.parse_url(url).success(resolve);
  });
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

function bootstrapTrackFromProvider(source, track) {
  return new Promise((resolve) => {
    if (track.source === source) {
      resolve(undefined);
      return;
    }

    const provider = getProviderByName(source);
    const url = `/search?${queryStringify(
      buildBootstrapTrackSearchOptions(track)
    )}`;

    provider.search(url).success((data) => {
      const candidate = data.result.find((searchTrack) =>
        isSameBootstrapCandidate(track, searchTrack)
      );

      if (!candidate) {
        resolve(undefined);
        return;
      }

      provider.bootstrap_track(candidate, resolve, () => resolve(undefined));
    });
  });
}

setPrototypeOfLocalStorage();

/**
 * Facade consumed by controllers. Provider methods intentionally return the
 * legacy chainable shape `{ success(fn) }`; keeping that shape here avoids
 * touching older Angular controller code while provider internals evolve.
 */
// eslint-disable-next-line no-unused-vars
const MediaService = {
  getLoginProviders() {
    return PROVIDERS.filter((i) => !i.hidden && i.support_login);
  },
  search(source, options) {
    const url = `/search?${queryStringify(options)}`;
    if (source === 'allmusic') {
      // search all platform and merge result
      const callbackArray = getAllSearchProviders().map((p) => (fn) => {
        p.search(url).success((r) => {
          fn(null, r);
        });
      });
      return {
        success: (fn) =>
          async.parallel(callbackArray, (err, platformResultArray) => {
            return fn(mergePlatformSearchResults(platformResultArray));
          }),
      };
    }
    const provider = getProviderByName(source);
    return provider.search(url);
  },

  showMyPlaylist() {
    return myplaylist.show_myplaylist('my');
  },

  showPlaylistArray(source, offset, filter_id) {
    const provider = getProviderByName(source);
    const url = `/show_playlist?${queryStringify({ offset, filter_id })}`;
    return provider.show_playlist(url);
  },

  getPlaylistFilters(source) {
    const provider = getProviderByName(source);
    return provider.get_playlist_filters();
  },

  getLyric(track_id, album_id, lyric_url, tlyric_url) {
    const provider = getProviderByItemId(track_id);
    const url = `/lyric?${queryStringify({
      track_id,
      album_id,
      lyric_url,
      tlyric_url,
    })}`;
    return provider.lyric(url);
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
      return {
        success: (fn) => fn(hit),
      };
    }
    return {
      success: (fn) =>
        provider.get_playlist(url).success((playlist) => {
          if (provider !== myplaylist && provider !== localmusic) {
            playlistCache.set(listId, playlist);
          }
          fn(playlist);
        }),
    };
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
    const successCallback = playerSuccessCallback;
    const sound = {};
    function failureCallback() {
      if (localStorage.getObject('enable_auto_choose_source') === false) {
        playerFailCallback();
        return;
      }
      // When the source provider cannot produce a playable URL, search mirror
      // providers by exact title/artist and use the first working bootstrap.
      const trackPlatform = getProviderNameByItemId(track.id);
      const failover_source_list = getLocalStorageValue(
        'auto_choose_source_list',
        ['kuwo', 'qq', 'migu']
      ).filter((i) => i !== trackPlatform);

      resolveFirstDefined(
        failover_source_list.map((source) =>
          bootstrapTrackFromProvider(source, track)
        )
      ).then((response) => {
        if (response === undefined) {
          playerFailCallback();
          return;
        }

        sound.url = response.url;
        sound.bitrate = response.bitrate;
        sound.platform = response.platform;
        playerSuccessCallback(sound);
      });
    }

    const provider = getProviderByName(track.source);

    provider.bootstrap_track(track, successCallback, failureCallback);
  },

  login(source, options) {
    const url = `/login?${queryStringify(options)}`;
    const provider = getProviderByName(source);

    return provider.login(url);
  },
  getUser(source) {
    const provider = getProviderByName(source);
    return provider.get_user();
  },
  getLoginUrl(source) {
    const provider = getProviderByName(source);
    return provider.get_login_url();
  },
  getUserCreatedPlaylist(source, options) {
    const provider = getProviderByName(source);
    const url = `/get_user_create_playlist?${queryStringify(options)}`;

    return provider.get_user_created_playlist(url);
  },
  getUserFavoritePlaylist(source, options) {
    const provider = getProviderByName(source);
    const url = `/get_user_favorite_playlist?${queryStringify(options)}`;

    return provider.get_user_favorite_playlist(url);
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
