/**
 * 文件职责：注册页面导航控制器，协调歌单历史、弹窗、拖放、本地导入和 JSON／Gist 备份恢复。
 *
 * 本文件没有需要逐项列出的文件级定义。
 */
/* eslint-disable no-shadow */
/* eslint-disable no-unused-vars */
/* eslint-disable no-param-reassign */
/* global angular notyf i18next MediaService l1Player hotkeys isElectron require GithubClient lastfm */
// 管理主页面视图，供子作用域调用导航操作。
angular.module('listenone').controller('NavigationController', [
  '$scope',
  '$timeout',
  '$rootScope',
  'LyricSearchSession',
  /**
   * 初始化 NavigationController 控制器，绑定模板使用的作用域状态和操作；在作用域销毁时执行已登记的清理处理。
   * @param $scope 当前控制器作用域。
   * @param $timeout Angular 延时服务。
   * @param $rootScope 应用根作用域；使用 page_title、$broadcast 字段。
   * @returns {void} 无返回值。
   */
  ($scope, $timeout, $rootScope, lyricSearch) => {
    $rootScope.page_title = { title: 'Listen 1', artist: '', status: '' };
    $scope.window_url_stack = [];
    $scope.window_poped_url_stack = [];
    $scope.current_tag = 2;
    $scope.is_window_hidden = 1;
    $scope.is_dialog_hidden = 1;
    $scope.tag_params = {};

    $scope.songs = [];
    $scope.$on('track:metadata', (event, trackId, metadata) => {
      $scope.songs.forEach((track) => {
        if (track.id === trackId) Object.assign(track, metadata);
      });
    });
    $scope.current_list_id = -1;

    $scope.dialog_song = '';
    $scope.dialog_type = 0;
    $scope.dialog_title = '';

    $scope.isDoubanLogin = false;

    $scope.lastfm = lastfm;

    $scope.isOpenSidebar = true;

    let windowGeneration = 0;
    let windowRequest;
    let directGeneration = 0;
    let directRequest;
    /**
     * 取消当前详情请求并推进请求代次，阻止过期响应更新界面。
     * 无参数。
     * @returns {void} 无返回值。
     */
    function cancelWindowRequest() {
      windowGeneration += 1;
      windowRequest?.cancel();
      windowRequest = null;
    }
    // Keep the source view intact while a lyric session temporarily occupies
    // the browser. The session survives layout destruction during theme changes.
    const lyricOriginFields = [
      'current_tag',
      'is_window_hidden',
      'window_type',
      'tag_params',
      'window_url_stack',
      'window_poped_url_stack',
      'songs',
      'list_id',
      'current_list_id',
      'cover_img_url',
      'playlist_title',
      'playlist_source_url',
      'is_mine',
      'is_local',
      'is_favorite',
    ];
    $scope.$on('lyric-search:open', () => {
      if ($scope.current_tag !== 7) {
        lyricSearch.origin = {
          fields: Object.fromEntries(
            lyricOriginFields.map((key) => [key, $scope[key]])
          ),
          scroll: document.querySelector('.browser')?.scrollTop || 0,
        };
      }
      cancelWindowRequest();
      $scope.current_tag = 7;
      $scope.is_window_hidden = 1;
      $scope.window_type = 'list';
      $timeout(() => {
        const browser = document.querySelector('.browser');
        if (browser) browser.scrollTop = 0;
      });
    });
    $scope.$on('lyric-search:back', () => {
      const { origin } = lyricSearch;
      if ($scope.current_tag !== 7 || !origin) return;
      Object.assign($scope, origin.fields);
      lyricSearch.leave();
      $timeout(() => {
        const browser = document.querySelector('.browser');
        if (browser) browser.scrollTop = origin.scroll;
      });
    });
    if (lyricSearch.active) $scope.current_tag = 7;
    $scope.$watchGroup(['current_tag', 'is_window_hidden'], () => {
      if (
        lyricSearch.active &&
        ($scope.current_tag !== 7 || $scope.is_window_hidden !== 1)
      )
        lyricSearch.leave();
    });

    /**
     * 忽略取消错误，对真正的歌单加载失败显示通知。
     * @param error 被捕获或传入的异常；使用 code 字段。
     * @returns {void} 无返回值。
     */
    function playlistError(error) {
      if (error.code !== 'CANCELLED')
        notyf.info(
          i18next.t(`_ERROR_${error.code}`, {
            defaultValue: i18next.t('_ERROR_UNKNOWN'),
          })
        );
    }
    /**
     * 读取歌单并用请求代次校验结果，更新封面、曲目、收藏标记和滚动位置。
     * @param listId 目标歌单或列表 ID。
     * @param useCache 是否优先使用已有歌单缓存。
     * @param [offset] 从列表开头跳过的条目数量；默认值为 0。
     * @returns {void} 无返回值。
     */
    function loadWindowPlaylist(listId, useCache, offset = 0) {
      cancelWindowRequest();
      const generation = windowGeneration;
      windowRequest = MediaService.getPlaylist(listId, useCache);
      windowRequest
        .success(
          /**
           * 进入此回调后，执行 $scope.$evalAsync。
           * @param data 本次处理或转发的业务数据；使用 status、reason、info、tracks 字段。
           * @returns {*} $scope.$evalAsync 的调用结果。
           */
          (data) =>
            $scope.$evalAsync(
              /**
               * 进入此回调后，更新 $scope.songs、$scope.list_id、$scope.cover_img_url、$scope.playlist_title，执行 notyf.info。
               * 无参数。
               * @returns {void} 无返回值。
               */
              () => {
                if (generation !== windowGeneration) return;
                if (data.status === '0') {
                  notyf.info(data.reason);
                  $scope.popWindow();
                  return;
                }
                if (!data.info || !Array.isArray(data.tracks)) {
                  playlistError({ code: 'INVALID_RESPONSE' });
                  return;
                }
                $scope.songs = data.tracks;
                $scope.list_id = data.info.id;
                $scope.cover_img_url = data.info.cover_img_url;
                $scope.playlist_title = data.info.title;
                $scope.playlist_source_url = data.info.source_url;
                $scope.is_mine = data.info.id.slice(0, 2) === 'my';
                $scope.is_local = data.info.id.slice(0, 2) === 'lm';
                $scope.window_type = 'list';
                MediaService.queryPlaylist(data.info.id, 'favorite').success(
                  /**
                   * 进入此回调后，执行 $scope.$evalAsync。
                   * @param res 异步响应或消息应答函数，按调用位置使用；使用 result 字段。
                   * @returns {void} 无返回值。
                   */
                  (res) => {
                    $scope.$evalAsync(
                      /**
                       * 进入此回调后，更新 $scope.is_favorite。
                       * 无参数。
                       * @returns {void} 无返回值。
                       */
                      () => {
                        if (generation === windowGeneration)
                          $scope.is_favorite = res.result;
                      }
                    );
                  }
                );
                $timeout(
                  /**
                   * 进入此回调后，更新 document.getElementsByClassName('browser')[0].scrollTop，执行 document.getElementsByClassName（"browser"）。
                   * 无参数。
                   * @returns {void} 无返回值。
                   */
                  () => {
                    if (generation === windowGeneration)
                      document.getElementsByClassName('browser')[0].scrollTop =
                        offset;
                  },
                  0
                );
              }
            )
        )
        .error(
          /**
           * 进入此回调后，执行 $scope.$evalAsync。
           * @param error 被捕获或传入的异常。
           * @returns {*} $scope.$evalAsync 的调用结果。
           */
          (error) =>
            $scope.$evalAsync(
              /**
               * 进入此回调后，更新 $scope.cover_img_url，执行 playlistError。
               * 无参数。
               * @returns {void} 无返回值。
               */
              () => {
                if (generation !== windowGeneration) return;
                $scope.cover_img_url = '';
                playlistError(error);
              }
            )
        );
    }
    $scope.$on(
      '$destroy',
      /**
       * 响应 "$destroy" 事件，更新 directGeneration，执行 cancelWindowRequest。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        cancelWindowRequest();
        directGeneration += 1;
        directRequest?.cancel();
      }
    );

    $scope.$on(
      'isdoubanlogin:update',
      /**
       * 响应 "isdoubanlogin:update" 事件，更新 $scope.isDoubanLogin。
       * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
       * @param data 本次处理或转发的业务数据。
       * @returns {void} 无返回值。
       */
      (event, data) => {
        $scope.isDoubanLogin = data;
      }
    );

    // 侧栏展开状态。

    if (localStorage.getObject('openSidebar') !== null) {
      $scope.isOpenSidebar = localStorage.getObject('openSidebar');
    }
    /**
     * 切换现代布局侧栏的展开状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.openSidebar = () => {
      $scope.isOpenSidebar = !$scope.isOpenSidebar;
      localStorage.setObject('openSidebar', $scope.isOpenSidebar);
    };
    // 当前页面分类。
    /**
     * 切换主页面分类和附加平台参数，同时关闭详情窗口。
     * @param tag_id 页面分类编号。
     * @param tag_params 分类附带的平台及用户信息；使用 user 字段。
     * @returns {void} 无返回值。
     */
    $scope.showTag = (tag_id, tag_params) => {
      $scope.current_tag = tag_id;
      $scope.is_window_hidden = 1;
      $scope.window_url_stack = [];
      $scope.window_poped_url_stack = [];
      $scope.tag_params = tag_params;
      if (tag_id === 6) {
        $rootScope.$broadcast('myplatform:update', tag_params.user);
      }
      $scope.closeWindow();
    };

    $scope.$on(
      'search:keyword_change',
      /**
       * 响应 "search:keyword_change" 事件，执行 $scope.showTag。
       * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
       * @param data 本次处理或转发的业务数据；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      (event, data) => {
        $scope.showTag(3);
      }
    );

    // 歌单详情窗口状态。
    /**
     * 清空当前详情状态并恢复指定滚动位置。
     * @param offset 从列表开头跳过的条目数量。
     * @returns {void} 无返回值。
     */
    $scope.resetWindow = (offset) => {
      cancelWindowRequest();
      if (offset === undefined) {
        offset = 0;
      }
      $scope.cover_img_url = 'images/loading.svg';
      $scope.playlist_title = '';
      $scope.playlist_source_url = '';
      $scope.songs = [];
      $scope.window_type = 'list';
      $timeout(
        /**
         * 进入此回调后，更新 document.getElementsByClassName('browser')[0].scrollTop，执行 document.getElementsByClassName（"browser"）。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          document.getElementsByClassName('browser')[0].scrollTop = offset;
        },
        0
      );
    };

    /**
     * 关闭详情并取消在途请求。
     * @param offset 从列表开头跳过的条目数量。
     * @returns {void} 无返回值。
     */
    $scope.closeWindow = (offset) => {
      if (offset === undefined) {
        offset = 0;
      }
      $scope.is_window_hidden = 1;
      $scope.resetWindow(offset);
      $scope.window_url_stack = [];
      $scope.window_poped_url_stack = [];
    };

    /**
     * 按历史 URL 重新打开歌单或正在播放视图，恢复对应滚动位置。
     * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
     * @param [offset] 从列表开头跳过的条目数量；默认值为 0。
     * @returns {void} 无返回值。
     */
    function refreshWindow(url, offset = 0) {
      if (url === '/now_playing') {
        $scope.window_type = 'track';
        return;
      }
      const listId = new URL(url, window.location).searchParams.get('list_id');
      loadWindowPlaylist(listId, true, offset);
    }
    /**
     * 弹出当前导航历史，返回前一视图并保存可前进记录。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.popWindow = () => {
      if ($scope.current_tag === 7 && lyricSearch.active) {
        $rootScope.$broadcast('lyric-search:back');
        return;
      }
      if ($scope.window_url_stack.length === 0) {
        return;
      }
      let poped = $scope.window_url_stack.pop();
      if ($scope.getCurrentUrl() === '/now_playing') {
        poped = $scope.window_url_stack.pop();
      }
      $scope.window_poped_url_stack.push(poped.url);
      if ($scope.window_url_stack.length === 0) {
        $scope.closeWindow(poped.offset);
      } else {
        $scope.resetWindow(poped.offset);
        const lastWindow = $scope.window_url_stack.slice(-1)[0];
        refreshWindow(lastWindow.url, poped.offset);
      }
    };

    /**
     * 在当前页面和正在播放详情之间切换，复用历史栈。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.toggleNowPlaying = () => {
      if ($scope.getCurrentUrl() === '/now_playing') {
        $scope.popWindow();
        return;
      }
      if (!$scope.menuHidden) {
        $scope.togglePlaylist();
      }
      // 保存当前滚动位置。
      $scope.is_window_hidden = 0;
      $scope.resetWindow();

      $scope.window_url_stack.push({
        url: '/now_playing',
        offset: document.getElementsByClassName('browser')[0].scrollTop,
      });
      $scope.window_poped_url_stack = [];

      $scope.window_type = 'track';
    };

    /**
     * 恢复前进栈中的页面并保存当前滚动位置。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.forwardWindow = () => {
      if ($scope.window_poped_url_stack.length === 0) {
        return;
      }

      $scope.resetWindow();
      const url = $scope.window_poped_url_stack.pop();
      $scope.window_url_stack.push({
        url,
        offset: 0,
      });
      refreshWindow(url);
    };

    /**
     * 读取导航栈顶 URL；空栈时按实现返回空值。
     * 无参数。
     * @returns {*} $scope.window_url_stack.slice(-1)[0] || {}.url。
     */
    $scope.getCurrentUrl = () =>
      ($scope.window_url_stack.slice(-1)[0] || {}).url;

    /**
     * 打开指定歌单，更新导航历史并按缓存选项加载详情。
     * @param list_id 目标歌单或列表 ID。
     * @param useCache 是否优先使用已有歌单缓存。
     * @returns {void} 无返回值。
     */
    $scope.showPlaylist = (list_id, useCache) => {
      $scope.clearFilter();
      const url = `/playlist?list_id=${list_id}`;
      // 保存当前滚动位置。
      const offset = document.getElementsByClassName('browser')[0].scrollTop;
      if ($scope.getCurrentUrl() === url) {
        return;
      }
      $scope.is_window_hidden = 0;
      $scope.resetWindow();

      if ($scope.getCurrentUrl() === '/now_playing') {
        // 正在播放页位于栈顶时先返回上一页。
        $scope.window_url_stack.pop();
      }
      $scope.window_url_stack.push({ url, offset });
      $scope.window_poped_url_stack = [];

      const listId = new URL(url, window.location).searchParams.get('list_id');
      loadWindowPlaylist(listId, useCache);
    };

    /**
     * 取消上一直接播放任务，加载所选歌单后替换队列并播放，丢弃过期结果。
     * @param list_id 目标歌单或列表 ID。
     * @returns {void} 无返回值。
     */
    $scope.directplaylist = (list_id) => {
      directGeneration += 1;
      const generation = directGeneration;
      directRequest?.cancel();
      directRequest = MediaService.getPlaylist(list_id);
      directRequest
        .success(
          /**
           * 进入此回调后，执行 $scope.$evalAsync。
           * @param data 本次处理或转发的业务数据；使用 tracks 字段。
           * @returns {*} $scope.$evalAsync 的调用结果。
           */
          (data) =>
            $scope.$evalAsync(
              /**
               * 进入此回调后，更新 $scope.current_list_id，执行 l1Player.setNewPlaylist。
               * 无参数。
               * @returns {void} 无返回值。
               */
              () => {
                if (generation !== directGeneration) return;
                if (!Array.isArray(data.tracks)) {
                  playlistError({ code: 'INVALID_RESPONSE' });
                  return;
                }
                $scope.current_list_id = list_id;
                l1Player.setNewPlaylist(data.tracks);
                l1Player.play();
              }
            )
        )
        .error(
          /**
           * 进入此回调后，执行 playlistError。
           * @param error 被捕获或传入的异常。
           * @returns {void} 无返回值。
           */
          (error) => {
            if (generation === directGeneration) playlistError(error);
          }
        );
    };

    /**
     * 按对话框类型设置标题、数据及待选歌单或备份，打开对应操作界面。
     * @param dialog_type 对话框类型编号。
     * @param data 本次处理或转发的业务数据；使用 cover_img_url、playlist_title 字段。
     * @returns {void} 无返回值。
     */
    $scope.showDialog = (dialog_type, data) => {
      $scope.is_dialog_hidden = 0;
      $scope.dialog_data = data;
      const dialogWidth = 400;
      const dialogHeight = 430;
      const left = window.innerWidth / 2 - dialogWidth / 2;
      const top = window.innerHeight / 2 - dialogHeight / 2;

      $scope.myStyle = {
        left: `${left}px`,
        top: `${top}px`,
      };
      $scope.dialog_type = dialog_type;
      if (dialog_type === 0) {
        $scope.dialog_title = i18next.t('_ADD_TO_PLAYLIST');
        $scope.dialog_song = data;
        MediaService.showMyPlaylist().success(
          /**
           * 进入此回调后，更新 $scope.myplaylist。
           * @param res 异步响应或消息应答函数，按调用位置使用；使用 result 字段。
           * @returns {void} 无返回值。
           */
          (res) => {
            $scope.myplaylist = res.result;
          }
        );
      }

      // 停用代码，保留供历史对照：
      // if (dialog_type === 2) {
      //   $scope.dialog_title = '登录豆瓣';
      //   $scope.dialog_type = 2;
      // }

      if (dialog_type === 3) {
        $scope.dialog_title = i18next.t('_EDIT_PLAYLIST');
        $scope.dialog_cover_img_url = data.cover_img_url;
        $scope.dialog_playlist_title = data.playlist_title;
      }
      if (dialog_type === 4) {
        $scope.dialog_title = i18next.t('_CONNECT_TO_LASTFM');
      }
      if (dialog_type === 5) {
        $scope.dialog_title = i18next.t('_OPEN_PLAYLIST');
      }
      if (dialog_type === 6) {
        $scope.dialog_title = i18next.t('_IMPORT_PLAYLIST');
        MediaService.showMyPlaylist().success(
          /**
           * 进入此回调后，更新 $scope.myplaylist。
           * @param res 异步响应或消息应答函数，按调用位置使用；使用 result 字段。
           * @returns {void} 无返回值。
           */
          (res) => {
            $scope.myplaylist = res.result;
          }
        );
      }
      if (dialog_type === 7) {
        $scope.dialog_title = i18next.t('_CONNECT_TO_GITHUB');
      }
      if (dialog_type === 8) {
        $scope.dialog_title = i18next.t('_EXPORT_TO_GITHUB_GIST');
        GithubClient.gist.listExistBackup().then(
          /**
           * 上一步异步操作完成后，更新 $scope.myBackup。
           * @param res 异步响应或消息应答函数，按调用位置使用。
           * @returns {void} 无返回值。
           */
          (res) => {
            $scope.myBackup = res;
          },
          /**
           * 上一步异步操作完成后，更新 $scope.myBackup。
           * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
           * @returns {void} 无返回值。
           */
          (err) => {
            $scope.myBackup = [];
          }
        );
      }
      if (dialog_type === 10) {
        $scope.dialog_title = i18next.t('_RECOVER_FROM_GITHUB_GIST');
        GithubClient.gist.listExistBackup().then(
          /**
           * 上一步异步操作完成后，更新 $scope.myBackup。
           * @param res 异步响应或消息应答函数，按调用位置使用。
           * @returns {void} 无返回值。
           */
          (res) => {
            $scope.myBackup = res;
          },
          /**
           * 上一步异步操作完成后，更新 $scope.myBackup。
           * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
           * @returns {void} 无返回值。
           */
          (err) => {
            $scope.myBackup = [];
          }
        );
      }
      if (dialog_type === 11) {
        $scope.dialog_title = i18next.t('_LOGIN');
      }
      if (dialog_type === 12) {
        $scope.dialog_title = i18next.t('_PROXY_CONFIG');
      }
    };

    /**
     * 解析拖放的 MIME 类型，区分歌单重排和曲目加入歌单，并通知相关列表刷新。
     * @param playlistType 自建或收藏歌单分类。
     * @param list_id 目标歌单或列表 ID。
     * @param data 本次处理或转发的业务数据；使用 info 字段。
     * @param dataType 拖放数据的 MIME 类型。
     * @param direction 插入或切换方向，使用调用方约定的前后标记。
     * @returns {void} 无返回值。
     */
    $scope.onSidebarPlaylistDrop = (
      playlistType,
      list_id,
      data,
      dataType,
      direction
    ) => {
      if (playlistType === 'my' && dataType === 'application/listen1-song') {
        $scope.addMyPlaylist(list_id, data);
      } else if (
        (playlistType === 'my' &&
          dataType === 'application/listen1-myplaylist') ||
        (playlistType === 'favorite' &&
          dataType === 'application/listen1-favoriteplaylist')
      ) {
        MediaService.insertMyplaylistToMyplaylists(
          playlistType,
          data.info.id,
          list_id,
          direction
        ).success(
          /**
           * 进入此回调后，执行 $rootScope.$broadcast（"myplaylist:update"）。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            if (playlistType === 'my') {
              $rootScope.$broadcast('myplaylist:update');
            }
            if (playlistType === 'favorite') {
              $rootScope.$broadcast('favoriteplaylist:update');
            }
          }
        );
      }
    };
    $scope.playlistFilter = { key: '' };

    /**
     * 清空当前歌单的文本筛选条件。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.clearFilter = () => {
      $scope.playlistFilter.key = '';
    };
    /**
     * 按筛选关键字匹配曲目标题、歌手和专辑。
     * @param song 来源歌曲记录或当前页面曲目；使用 title、artist、album 字段。
     * @returns {*} true；其他分支返回 song.title.includes 的布尔判断结果，为空或假值时使用 song.artist.includes 的布尔判断结果，为空或假值时使用 song.album 且 song.album.includes 的布尔判断结果。
     */
    $scope.fieldFilter = (song) => {
      if ($scope.playlistFilter.key === '') {
        return true;
      }
      return (
        song.title.includes($scope.playlistFilter.key) ||
        song.artist.includes($scope.playlistFilter.key) ||
        (song.album && song.album.includes($scope.playlistFilter.key))
      );
    };
    /**
     * 根据拖放类型将曲目插入当前歌单指定位置。
     * @param list_id 目标歌单或列表 ID。
     * @param song 来源歌曲记录或当前页面曲目。
     * @param data 本次处理或转发的业务数据。
     * @param dataType 拖放数据的 MIME 类型。
     * @param direction 插入或切换方向，使用调用方约定的前后标记。
     * @returns {void} 无返回值。
     */
    $scope.onPlaylistSongDrop = (list_id, song, data, dataType, direction) => {
      if (dataType === 'application/listen1-song') {
        // 插入曲目。
        MediaService.insertTrackToMyPlaylist(
          list_id,
          data,
          song,
          direction
        ).success(
          /**
           * 进入此回调后，执行 $scope.closeDialog。
           * @param playlist 包含 info 和 tracks 的歌单数据；使用 tracks 字段。
           * @returns {void} 无返回值。
           */
          (playlist) => {
            $scope.closeDialog();
            if (list_id === $scope.list_id) {
              $scope.$evalAsync(
                /**
                 * 进入此回调后，更新 $scope.songs。
                 * 无参数。
                 * @returns {void} 无返回值。
                 */
                () => {
                  $scope.songs = playlist.tracks;
                }
              );
            }
          }
        );
      }
    };

    /**
     * 在当前播放队列中将拖入曲目放到目标前后。
     * @param song 来源歌曲记录或当前页面曲目。
     * @param data 本次处理或转发的业务数据。
     * @param dataType 拖放数据的 MIME 类型。
     * @param direction 插入或切换方向，使用调用方约定的前后标记。
     * @returns {void} 无返回值。
     */
    $scope.onCurrentPlayingSongDrop = (song, data, dataType, direction) => {
      if (dataType === 'application/listen1-song') {
        l1Player.insertTrack(data, song, direction);
      }
    };

    /**
     * 按曲目 ID 请求播放。
     * @param id 目标条目的唯一标识。
     * @returns {void} 无返回值。
     */
    $scope.playById = (id) => {
      l1Player.playById(id);
    };

    /**
     * 把曲目加入队列后立即按 ID 播放。
     * @param song 来源歌曲记录或当前页面曲目；使用 id 字段。
     * @returns {void} 无返回值。
     */
    $scope.addAndPlay = (song) => {
      l1Player.addTrack(song);
      l1Player.playById(song.id);
    };

    /**
     * 把所选曲目加入指定自建歌单，并显示完成通知。
     * @param option_id 用户选择的目标歌单 ID。
     * @param song 来源歌曲记录或当前页面曲目。
     * @returns {void} 无返回值。
     */
    $scope.addMyPlaylist = (option_id, song) => {
      MediaService.addMyPlaylist(option_id, song).success(
        /**
         * 进入此回调后，更新 $scope.songs，执行 $scope.closeDialog。
         * @param playlist 包含 info 和 tracks 的歌单数据；使用 tracks 字段。
         * @returns {void} 无返回值。
         */
        (playlist) => {
          notyf.success(i18next.t('_ADD_TO_PLAYLIST_SUCCESS'));
          $scope.closeDialog();
          // 加入当前播放队列。
          if (option_id === $scope.current_list_id) {
            l1Player.addTrack($scope.dialog_song);
          }
          if (option_id === $scope.list_id) {
            $scope.songs = playlist.tracks;
          }
        }
      );
    };

    /**
     * 把当前对话框携带的曲目加入用户选择的歌单。
     * @param option_id 用户选择的目标歌单 ID。
     * @returns {void} 无返回值。
     */
    $scope.chooseDialogOption = (option_id) => {
      $scope.addMyPlaylist(option_id, $scope.dialog_song);
    };

    /**
     * 切换到创建新歌单或新备份的对话框。
     * @param option 将要切换到的对话框编号。
     * @returns {void} 无返回值。
     */
    $scope.newDialogOption = (option) => {
      $scope.dialog_type = option;
    };

    /**
     * 取消新建子界面并回到原选择对话框。
     * @param option 将要切换到的对话框编号。
     * @returns {void} 无返回值。
     */
    $scope.cancelNewDialog = (option) => {
      $scope.dialog_type = option;
    };

    /**
     * 创建新歌单并加入对话框中的曲目，然后刷新列表并关闭对话框。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.createAndAddPlaylist = () => {
      MediaService.createMyPlaylist(
        $scope.newlist_title,
        $scope.dialog_song
      ).success(
        /**
         * 进入此回调后，执行 $scope.closeDialog。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          $rootScope.$broadcast('myplaylist:update');
          notyf.success(i18next.t('_ADD_TO_PLAYLIST_SUCCESS'));
          $scope.closeDialog();
        }
      );
    };

    /**
     * 保存对话框中的歌单标题和封面，并刷新详情和侧栏。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.editMyPlaylist = () => {
      MediaService.editMyPlaylist(
        $scope.list_id,
        $scope.dialog_playlist_title,
        $scope.dialog_cover_img_url
      ).success(
        /**
         * 进入此回调后，更新 $scope.playlist_title、$scope.cover_img_url，执行 $scope.closeDialog。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          $rootScope.$broadcast('myplaylist:update');
          $scope.playlist_title = $scope.dialog_playlist_title;
          $scope.cover_img_url = $scope.dialog_cover_img_url;
          notyf.success(i18next.t('_EDIT_PLAYLIST_SUCCESS'));
          $scope.closeDialog();
        }
      );
    };

    /**
     * 将所选歌单内容合并到当前歌单，再刷新详情。
     * @param target_list_id 合并时选择的目标歌单 ID。
     * @returns {void} 无返回值。
     */
    $scope.mergePlaylist = (target_list_id) => {
      notyf.info(i18next.t('_IMPORTING_PLAYLIST'));
      MediaService.mergePlaylist($scope.list_id, target_list_id).success(
        /**
         * 进入此回调后，执行 $scope.closeDialog。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          notyf.success(i18next.t('_IMPORTING_PLAYLIST_SUCCESS'));
          $scope.closeDialog();
          $scope.popWindow();
          $scope.showPlaylist($scope.list_id);
        }
      );
    };

    /**
     * 删除指定歌单中的曲目并同步当前显示列表。
     * @param song 来源歌曲记录或当前页面曲目；使用 id 字段。
     * @param list_id 目标歌单或列表 ID。
     * @returns {void} 无返回值。
     */
    $scope.removeSongFromPlaylist = (song, list_id) => {
      let removeFunc = null;
      if (list_id.slice(0, 2) === 'my') {
        removeFunc = MediaService.removeTrackFromMyPlaylist;
      } else if (list_id.slice(0, 2) === 'lm') {
        removeFunc = MediaService.removeTrackFromPlaylist;
      }

      removeFunc(list_id, song.id).success(
        /**
         * 进入此回调后，执行 $scope.songs.indexOf。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          // 从页面曲目列表中移除。
          const index = $scope.songs.indexOf(song);
          if (index > -1) {
            $scope.songs.splice(index, 1);
          }
          notyf.success(i18next.t('_REMOVE_SONG_FROM_PLAYLIST_SUCCESS'));
        }
      );
    };

    /**
     * 隐藏对话框，并按授权状态刷新 Last.fm。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.closeDialog = () => {
      $scope.is_dialog_hidden = 1;
      $scope.dialog_type = 0;
      // 尚未授权时刷新 Last.fm 状态。
      if (lastfm.isAuthRequested()) {
        lastfm.updateStatus();
      }
    };

    /**
     * 保存当前正在操作的歌单 ID。
     * @param list_id 目标歌单或列表 ID。
     * @returns {void} 无返回值。
     */
    $scope.setCurrentList = (list_id) => {
      $scope.current_list_id = list_id;
    };

    /**
     * 把当前歌单设为播放队列并从头播放。
     * @param list_id 目标歌单或列表 ID。
     * @returns {void} 无返回值。
     */
    $scope.playMylist = (list_id) => {
      l1Player.setNewPlaylist($scope.songs);
      l1Player.play();
      $scope.setCurrentList(list_id);
    };

    /**
     * 把当前歌单曲目批量追加到播放队列。
     * @param list_id 目标歌单或列表 ID；当前函数体未使用，保留调用签名。
     * @returns {void} 无返回值。
     */
    $scope.addMylist = (list_id) => {
      $timeout(
        /**
         * 进入此回调后，执行 l1Player.addTracks。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          // 向歌单加入曲目。
          l1Player.addTracks($scope.songs);
          notyf.success(i18next.t('_ADD_TO_QUEUE_SUCCESS'));
        },
        0
      );
    };

    /**
     * 将来源歌单复制为自建歌单并刷新侧栏。
     * @param list_id 目标歌单或列表 ID。
     * @returns {void} 无返回值。
     */
    $scope.clonePlaylist = (list_id) => {
      MediaService.clonePlaylist(list_id, 'my').success(
        /**
         * 进入此回调后，执行 $scope.closeWindow。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          $rootScope.$broadcast('myplaylist:update');
          $scope.closeWindow();
          notyf.success(i18next.t('_ADD_TO_PLAYLIST_SUCCESS'));
        }
      );
    };

    /**
     * 删除当前自建歌单并关闭相关详情和对话框。
     * @param list_id 目标歌单或列表 ID。
     * @returns {void} 无返回值。
     */
    $scope.removeMyPlaylist = (list_id) => {
      MediaService.removeMyPlaylist(list_id, 'my').success(
        /**
         * 进入此回调后，执行 $scope.closeDialog。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          $rootScope.$broadcast('myplaylist:update');
          $scope.closeDialog();
          $scope.closeWindow();
          notyf.success(i18next.t('_REMOVE_PLAYLIST_SUCCESS'));
        }
      );
    };

    /**
     * 创建下载链接输出文本文件，触发浏览器下载后移除临时节点。
     * @param fileName 下载文件名。
     * @param fileType 下载文件的 MIME 类型。
     * @param content 文件、歌词或备份内容。
     * @returns {void} 无返回值。
     */
    $scope.downloadFile = (fileName, fileType, content) => {
      window.URL = window.URL || window.webkitURL;
      const blob = new Blob([content], {
        type: fileType,
      });
      const link = document.createElement('a');
      link.download = fileName;
      link.href = window.URL.createObjectURL(blob);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(link.href);
    };

    /**
     * 遍历 localStorage 并导出 JSON；导出内容包含现有存储项，不执行脱敏。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.backupMySettings = () => {
      const items = {};
      Object.keys(localStorage).forEach(
        /**
         * 逐项处理 Object.keys() 中的条目，更新 items[key]，执行 localStorage.getObject。
         * @param key 来自 Object.keys() 的当前条目。
         * @returns {void} 无返回值。
         */
        (key) => {
          items[key] = localStorage.getObject(key);
        }
      );

      const content = JSON.stringify(items);
      $scope.downloadFile('listen1_backup.json', 'application/json', content);
    };

    /**
     * 读取所选文件，要求 JSON 为非数组对象后逐项写入本地存储；失败时通知且不清空原数据。
     * @param event 触发当前处理器的事件对象；使用 target 字段。
     * @returns {void} 无返回值。
     */
    $scope.importMySettings = (event) => {
      const fileObject = event.target.files[0];
      if (!fileObject) {
        notyf.warning('请选择备份文件');
        return;
      }
      const reader = new FileReader();
      /**
       * 解析已读取的备份文本，验证顶层结构后恢复存储并刷新歌单。
       * @param readerEvent 文件读取完成事件；使用 target 字段。
       * @returns {void} 无返回值。
       */
      reader.onloadend = (readerEvent) => {
        if (readerEvent.target.readyState === FileReader.DONE) {
          const data_json = readerEvent.target.result;
          // 解析备份 JSON。
          let data = null;
          try {
            data = JSON.parse(data_json);
            if (!data || typeof data !== 'object' || Array.isArray(data))
              throw new Error('Invalid backup');
          } catch (e) {
            notyf.warning('备份文件格式错误，请重新选择');
            return;
          }

          Object.keys(data).forEach(
            /**
             * 逐项处理 Object.keys() 中的条目，localStorage.setObject 的调用结果。
             * @param item 来自 Object.keys() 的当前条目。
             * @returns {*} localStorage.setObject 的调用结果。
             */
            (item) => localStorage.setObject(item, data[item])
          );
          $rootScope.$broadcast('myplaylist:update');
          notyf.success('成功导入我的歌单');
        }
      };
      reader.readAsText(fileObject);
    };

    $scope.gistBackupLoading = false;
    /**
     * 整理本地设置并排除已知 GitHub 令牌及 Gist 键，再创建或更新备份。
     * @param gistId 目标 Gist 标识；新建备份时可为空。
     * @param isPublic 新建备份是否公开。
     * @returns {void} 无返回值。
     */
    $scope.backupMySettings2Gist = (gistId, isPublic) => {
      const items = {};
      Object.keys(localStorage).forEach(
        /**
         * 逐项处理 Object.keys() 中的条目，更新 items[key]，执行 localStorage.getObject。
         * @param key 来自 Object.keys() 的当前条目。
         * @returns {void} 无返回值。
         */
        (key) => {
          if (key !== 'gistid' && key !== 'githubOauthAccessKey') {
            // 排除已知的 GitHub 令牌键；这不等同于清理全部敏感设置。
            items[key] = localStorage.getObject(key);
          }
        }
      );
      const gistFiles = GithubClient.gist.json2gist(items);
      $scope.gistBackupLoading = true;
      GithubClient.gist.backupMySettings2Gist(gistFiles, gistId, isPublic).then(
        /**
         * 上一步异步操作完成后，更新 $scope.gistBackupLoading，执行 notyf.dismissAll。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          notyf.dismissAll();
          notyf.success('成功导出我的歌单到Gist');
          $scope.gistBackupLoading = false;
        },
        /**
         * 上一步异步操作完成后，更新 $scope.gistBackupLoading，执行 notyf.dismissAll。
         * @param err 异步操作的错误；成功回调通常为 null；当前函数体未使用，保留调用签名。
         * @returns {void} 无返回值。
         */
        (err) => {
          notyf.dismissAll();
          notyf.warning('导出我的歌单失败，检查后重试');
          $scope.gistBackupLoading = false;
        }
      );
      notyf.info('正在导出我的歌单到Gist...');
    };

    $scope.gistRestoreLoading = false;
    /**
     * 读取 Gist 备份，解析并合并设置后刷新歌单；维护加载标记并处理失败。
     * @param gistId 目标 Gist 标识；新建备份时可为空。
     * @returns {void} 无返回值。
     */
    $scope.importMySettingsFromGist = (gistId) => {
      $scope.gistRestoreLoading = true;
      GithubClient.gist.importMySettingsFromGist(gistId).then(
        /**
         * 上一步异步操作完成后，执行 GithubClient.gist.gist2json。
         * @param raw Gist 请求得到的文件字典。
         * @returns {void} 无返回值。
         */
        (raw) => {
          GithubClient.gist.gist2json(
            raw,
            /**
             * 进入此回调后，更新 $scope.gistRestoreLoading，执行 Object.keys().forEach。
             * @param data 本次处理或转发的业务数据。
             * @returns {void} 无返回值。
             */
            (data) => {
              Object.keys(data).forEach(
                /**
                 * 逐项处理 Object.keys() 中的条目，localStorage.setObject 的调用结果。
                 * @param item 来自 Object.keys() 的当前条目。
                 * @returns {*} localStorage.setObject 的调用结果。
                 */
                (item) => localStorage.setObject(item, data[item])
              );
              notyf.dismissAll();
              notyf.success('导入我的歌单成功');
              $scope.gistRestoreLoading = false;
              $rootScope.$broadcast('myplaylist:update');
            }
          );
        },
        /**
         * 上一步异步操作完成后，更新 $scope.gistRestoreLoading，执行 notyf.dismissAll。
         * @param err 异步操作的错误；成功回调通常为 null。
         * @returns {void} 无返回值。
         */
        (err) => {
          notyf.dismissAll();
          if (err === 404) {
            notyf.warning('未找到备份歌单，请先备份');
          } else {
            notyf.warning('导入我的歌单失败，检查后重试');
          }
          $scope.gistRestoreLoading = false;
        }
      );
      notyf.info('正在从Gist导入我的歌单...');
    };

    /**
     * 保留快捷键显示入口；当前函数体为空。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.showShortcuts = () => {};

    // 停用代码，保留供历史对照：
    // description: '快速搜索',
    hotkeys(
      'f',
      /**
       * 进入此回调后，执行 $scope.showTag。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        $scope.showTag(3);
        $timeout(
          /**
           * 进入此回调后，执行 document.getElementById().focus。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            document.getElementById('search-input').focus();
          },
          0
        );
      }
    );

    /**
     * 解析用户输入的平台歌单链接，匹配成功后打开详情。
     * @param url 待解析或请求的地址；来源适配器使用其中的查询参数。
     * @returns {void} 无返回值。
     */
    $scope.openUrl = (url) => {
      MediaService.parseURL(url).success(
        /**
         * 进入此回调后，执行 $scope.showPlaylist。
         * @param data 本次处理或转发的业务数据。
         * @returns {void} 无返回值。
         */
        (data) => {
          const { result } = data;
          if (result !== undefined) {
            $scope.showPlaylist(result.id);
          } else {
            notyf.info(i18next.t('_FAIL_OPEN_PLAYLIST_URL'));
          }
        }
      );
    };

    /**
     * 根据当前收藏状态执行添加或移除。
     * @param list_id 目标歌单或列表 ID。
     * @returns {void} 无返回值。
     */
    $scope.favoritePlaylist = (list_id) => {
      if ($scope.is_favorite) {
        $scope.removeFavoritePlaylist(list_id);
        $scope.is_favorite = 0;
      } else {
        $scope.addFavoritePlaylist(list_id);
        $scope.is_favorite = 1;
      }
    };
    /**
     * 收藏远程歌单并刷新本地收藏索引。
     * @param list_id 目标歌单或列表 ID。
     * @returns {void} 无返回值。
     */
    $scope.addFavoritePlaylist = (list_id) => {
      MediaService.clonePlaylist(list_id, 'favorite').success(
        /**
         * 进入此回调后，执行 $rootScope.$broadcast（"favoriteplaylist:update"）。
         * @param addResult 歌单克隆完成后交出的结果；当前函数体未使用，保留调用签名。
         * @returns {void} 无返回值。
         */
        (addResult) => {
          $rootScope.$broadcast('favoriteplaylist:update');
          notyf.success(i18next.t('_FAVORITE_PLAYLIST_SUCCESS'));
        }
      );
    };

    /**
     * 取消收藏并更新详情中的收藏状态。
     * @param list_id 目标歌单或列表 ID。
     * @returns {void} 无返回值。
     */
    $scope.removeFavoritePlaylist = (list_id) => {
      MediaService.removeMyPlaylist(list_id, 'favorite').success(
        /**
         * 进入此回调后，执行 $rootScope.$broadcast（"favoriteplaylist:update"）。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          $rootScope.$broadcast('favoriteplaylist:update');
          // 停用代码，保留供历史对照：
          // $scope.closeWindow();
          notyf.success(i18next.t('_UNFAVORITE_PLAYLIST_SUCCESS'));
        }
      );
    };

    /**
     * 通过桌面桥选择并解析音频，把成功曲目批量加入本地歌单，并分别提示取消或部分失败。
     * @param list_id 目标歌单或列表 ID。
     * @returns {void} 无返回值。
     */
    $scope.addLocalMusic = (list_id) => {
      if (isElectron()) {
        window.listen1Desktop
          .importLocalMusic()
          .then(
            /**
             * 上一步异步操作完成后，执行 MediaService.addPlaylist().success。
             * @param result 前一步处理结果；使用 cancelled、tracks、errors 字段。
             * @returns {void} 无返回值。
             */
            (result) => {
              if (result.cancelled || !result.tracks.length) {
                return;
              }

              const list_id = 'lmplaylist_reserve';
              MediaService.addPlaylist(list_id, result.tracks).success(
                /**
                 * 进入此回调后，更新 $scope.songs、$scope.list_id、$scope.cover_img_url、$scope.playlist_title，执行 $scope.$evalAsync。
                 * @param res 异步响应或消息应答函数，按调用位置使用。
                 * @returns {void} 无返回值。
                 */
                (res) => {
                  const { playlist } = res;
                  $scope.songs = playlist.tracks;
                  $scope.list_id = playlist.info.id;
                  $scope.cover_img_url = playlist.info.cover_img_url;
                  $scope.playlist_title = playlist.info.title;
                  $scope.playlist_source_url = playlist.info.source_url;
                  $scope.is_mine = playlist.info.id.slice(0, 2) === 'my';
                  $scope.is_local = playlist.info.id.slice(0, 2) === 'lm';
                  $scope.$evalAsync();
                }
              );
              if (result.errors.length)
                notyf.info(i18next.t('_LOCAL_IMPORT_PARTIAL'));
            }
          )
          .catch(
            /**
             * 异步操作失败后，执行 notyf.info。
             * @param err 被当前异步链捕获的异常；当前函数体未使用，保留调用签名。
             * @returns {void} 无返回值。
             */
            (err) => {
              notyf.info(i18next.t('_LOCAL_IMPORT_FAILED'));
            }
          );
      }
    };
  },
]);
