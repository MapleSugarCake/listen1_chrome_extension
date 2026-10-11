/**
 * 文件职责：注册播放控制器，将播放器事件同步到页面和持久化设置，处理歌词时间线、快捷键、悬浮歌词与播放记录。
 *
 * 文件级定义：
 * - getCSSStringFromSetting：把歌词窗口设置转换为 CSS。
 * - useModernTheme：读取已存主题并判断是否使用现代布局。
 * - getSafeIndex：将正负索引按队列长度循环折返。
 * - formatSecond：把秒数格式化为分钟和两位秒数的页面文字。
 */
/* eslint-disable no-param-reassign */

/* global angular notyf i18next MediaService l1Player hotkeys GithubClient isElectron getLocalStorageValue getPlayer getPlayerAsync addPlayerListener smoothScrollTo lastfm */

/**
 * 把歌词窗口设置转换为 CSS；透明度为零时使用 0.01，以保留透明窗口的鼠标事件。
 * @param setting 悬浮歌词窗口外观设置；使用 fontSize、color 字段。
 * @returns {string} 用于悬浮歌词窗口的完整 CSS 文本。
 */
function getCSSStringFromSetting(setting) {
  let { backgroundAlpha } = setting;
  if (backgroundAlpha === 0) {
    // 背景完全透明时可能无法触发鼠标离开事件，
    // 因此用极低但非零的透明度保留事件命中。
    // 此兼容处理针对关闭硬件加速时的 Windows 歌词窗口。
    // 透明窗口仍需按实际桌面环境验证。
    backgroundAlpha = 0.01;
  }
  return `div.content.lyric-content{
      font-size: ${setting.fontSize}px;
      color: ${setting.color};
      background: rgba(36, 36, 36, ${backgroundAlpha});
    }
    div.content.lyric-content span.contentTrans {
      font-size: ${setting.fontSize - 4}px;
    }
    `;
}

/**
 * 读取已存主题并判断是否使用现代布局。
 * 无参数。
 * @returns {boolean} 当前存储主题是否属于现代布局。
 */
function useModernTheme() {
  const defaultTheme = localStorage.getObject('theme');
  return defaultTheme === 'white2' || defaultTheme === 'black2';
}

// 队列导航在各播放模式下循环折返，
// 统一索引算法使舞台封面与实际播放索引保持一致。
/**
 * 将正负索引按队列长度循环折返；长度为零时沿用余数表达式的结果。
 * @param index 当前条目的零起点索引。
 * @param length 目标长度或队列总长度。
 * @returns {number} 折返后的索引；空队列时结果为 NaN。
 */
function getSafeIndex(index, length) {
  if (index < 0) {
    const r = index % length;
    if (r < 0) {
      return length + (index % length);
    }
    return r;
  }
  if (index > length - 1) {
    return index % length;
  }
  return index;
}

/**
 * 把秒数格式化为分钟和两位秒数的页面文字。
 * @param posSec 待显示的秒数。
 * @returns {string} 按分钟和两位秒数显示的时间。
 */
function formatSecond(posSec) {
  return `${Math.floor(posSec / 60)}:${`0${posSec % 60}`.slice(-2)}`;
}

angular.module('listenone').controller('PlayController', [
  '$scope',
  '$timeout',
  '$log',
  '$anchorScroll',
  '$location',
  '$rootScope',
  /**
   * 初始化 PlayController 控制器，绑定模板使用的作用域状态和操作；在作用域销毁时执行已登记的清理处理。
   * @param $scope 当前控制器作用域。
   * @param $timeout Angular 延时服务。
   * @param $log Angular 日志服务；当前函数体未使用，保留调用签名。
   * @param $anchorScroll 按当前锚点滚动页面的 Angular 服务。
   * @param $location Angular 页面地址服务；当前函数体未使用，保留调用签名。
   * @param $rootScope 应用根作用域；使用 openGithubAuth、GithubLogout、updateGithubStatus、$on、page_title、document_title 字段。
   * @returns {void} 无返回值。
   */
  ($scope, $timeout, $log, $anchorScroll, $location, $rootScope) => {
    $scope.menuHidden = true;
    $scope.volume = l1Player.status.volume;
    $scope.mute = l1Player.status.muted;
    $scope.settings = {
      playmode: 0,
      nowplaying_track_id: -1,
    };
    $scope.lyricArray = [];
    $scope.lyricLineNumber = -1;
    $scope.lastTrackId = null;
    let lyricRequest = null;
    let lyricGeneration = 0;
    let lyricDisposed = false;
    let lastFloatingLyric = null;
    $scope.$on(
      '$destroy',
      /**
       * 响应 "$destroy" 事件，执行 lyricRequest.cancel。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        lyricDisposed = true;
        lyricGeneration += 1;
        if (lyricRequest) lyricRequest.cancel();
      }
    );

    $scope.enableGloablShortcut = false;
    $scope.isChrome = !isElectron();
    $scope.isMac = false;

    $scope.currentDuration = '0:00';
    $scope.currentDurationSeconds = 0;
    $scope.currentPosition = '0:00';

    $scope.currentIndex = 0;
    $scope.staged_playlist = [];
    /**
     * 取得循环折返索引对应的舞台曲目标识。
     * @param index 当前条目的零起点索引。
     * @returns {string} 按当前字段拼接的字符串。
     */
    $scope.getSongIdByIndex = (index) => {
      const songId =
        $scope.playlist[getSafeIndex(index, $scope.playlist.length)].id;
      return `${songId}_${index}`;
    };

    /**
     * 只保留当前曲目前后的五项舞台数据，控制现代主题的封面节点数量。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.refreshStage = () => {
      if ($scope.playlist === undefined) {
        return;
      }
      // 现代主题只渲染当前曲目前后的少量封面，
      // 避免大队列引入过多 DOM 节点。
      const STAGED_LENGTH = 5;
      let i = $scope.currentIndex - 2;
      $scope.staged_playlist = [];
      while ($scope.staged_playlist.length < STAGED_LENGTH) {
        const song = $scope.playlist[getSafeIndex(i, $scope.playlist.length)];
        if (!song) {
          break;
        }
        $scope.staged_playlist.push({ ...song, stageId: `${song.id}_${i}` });
        i += 1;
      }
    };

    if (!$scope.isChrome) {
      $scope.isMac = window.listen1Desktop.platform === 'darwin';
    }

    /**
     * 将页面顺序、随机、单曲模式转换为核心循环模式。
     * @param mode 前台／后台或播放模式值，按当前接口约定使用。
     * @returns {void} 无返回值。
     */
    function switchMode(mode) {
      // 页面模式：0 为列表循环，1 为随机，2 为单曲循环。
      switch (mode) {
        case 0:
          l1Player.setLoopMode('all');
          break;
        case 1:
          l1Player.setLoopMode('shuffle');
          break;
        case 2:
          l1Player.setLoopMode('one');
          break;
        default:
      }
    }

    /**
     * 恢复音量、播放模式、歌词、备用来源与显示设置，并同步桌面能力。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.loadLocalSettings = () => {
      const defaultSettings = {
        playmode: 0,
        nowplaying_track_id: -1,
        volume: 90,
      };
      const localSettings = localStorage.getObject('player-settings');
      if (localSettings === null) {
        $scope.settings = defaultSettings;
        $scope.saveLocalSettings();
      } else {
        $scope.settings = localSettings;
      }
      // 将已存设置应用到播放器。
      switchMode($scope.settings.playmode);

      $scope.volume = $scope.settings.volume;
      if ($scope.volume === null) {
        $scope.volume = 90;
        $scope.saveLocalSettings();
      } else {
        l1Player.setVolume($scope.volume);
      }
      $scope.enableGlobalShortCut = localStorage.getObject(
        'enable_global_shortcut'
      );
      $scope.enableLyricFloatingWindow = localStorage.getObject(
        'enable_lyric_floating_window'
      );
      $scope.enableLyricTranslation = localStorage.getObject(
        'enable_lyric_translation'
      );
      $scope.enableLyricFloatingWindowTranslation = localStorage.getObject(
        'enable_lyric_floating_window_translation'
      );
      $scope.enableAutoChooseSource = getLocalStorageValue(
        'enable_auto_choose_source',
        true
      );
      $scope.autoChooseSourceList = getLocalStorageValue(
        'auto_choose_source_list',
        ['kuwo', 'qq', 'migu']
      );
      $scope.enableStopWhenClose =
        isElectron() || getLocalStorageValue('enable_stop_when_close', true);
      $scope.enableNowplayingCoverBackground = getLocalStorageValue(
        'enable_nowplaying_cover_background',
        false
      );
      $scope.enableNowplayingBitrate = getLocalStorageValue(
        'enable_nowplaying_bitrate',
        false
      );
      $scope.enableNowplayingPlatform = getLocalStorageValue(
        'enable_nowplaying_platform',
        false
      );

      const defaultFloatWindowSetting = {
        fontSize: 20,
        color: '#ffffff',
        backgroundAlpha: 0.2,
      };

      $scope.floatWindowSetting = getLocalStorageValue(
        'float_window_setting',
        defaultFloatWindowSetting
      );

      $scope.applyGlobalShortcut();
      $scope.openLyricFloatingWindow();
    };

    // 桌面全局快捷键。
    /**
     * 按切换参数启用或禁用桌面全局快捷键并保存设置。
     * @param toggle 是否切换当前开关状态。
     * @returns {void} 无返回值。
     */
    $scope.applyGlobalShortcut = (toggle) => {
      if (!isElectron()) {
        return;
      }
      let message;
      if (toggle === true) {
        $scope.enableGlobalShortCut = !$scope.enableGlobalShortCut;
      }
      if ($scope.enableGlobalShortCut === true) {
        message = 'enable_global_shortcut';
      } else {
        message = 'disable_global_shortcut';
      }

      // 根据设置决定是否启用全局快捷键。
      localStorage.setObject(
        'enable_global_shortcut',
        $scope.enableGlobalShortCut
      );

      window.listen1Desktop.control(message);
    };

    /**
     * 按设置切换悬浮歌词窗口并发送当前样式与歌词。
     * @param toggle 是否切换当前开关状态。
     * @returns {void} 无返回值。
     */
    $scope.openLyricFloatingWindow = (toggle) => {
      if (!isElectron()) {
        return;
      }
      let message;
      if (toggle === true) {
        $scope.enableLyricFloatingWindow = !$scope.enableLyricFloatingWindow;
      }
      if ($scope.enableLyricFloatingWindow === true) {
        message = 'enable_lyric_floating_window';
      } else {
        message = 'disable_lyric_floating_window';
      }
      localStorage.setObject(
        'enable_lyric_floating_window',
        $scope.enableLyricFloatingWindow
      );

      window.listen1Desktop.control(
        message,
        getCSSStringFromSetting($scope.floatWindowSetting)
      );
    };

    if (isElectron()) {
      // 停用代码，保留供历史对照：
      // webFrame.setVisualZoomLevelLimits(1, 3);
      $scope.$on(
        '$destroy',
        window.listen1Desktop.on(
          'setZoomLevel',
          /**
           * 响应 "setZoomLevel" 事件，执行 window.listen1Desktop.setZoomLevel。
           * @param level 页面缩放级别。
           * @returns {void} 无返回值。
           */
          (level) => {
            window.listen1Desktop.setZoomLevel(level);
          }
        )
      );
      $scope.$on(
        '$destroy',
        window.listen1Desktop.on(
          'lyricWindow',
          /**
           * 响应 "lyricWindow" 事件，更新 $scope.floatWindowSetting.fontSize、$scope.floatWindowSetting.backgroundAlpha、$scope.floatWindowSetting.color，执行 localStorage.setObject（"float_window_setting"）。
           * @param arg 传入页面条件函数的值或桌面控制操作名。
           * @returns {void} 无返回值。
           */
          (arg) => {
            if (arg === 'float_window_close') {
              $scope.openLyricFloatingWindow(true);
            } else if (
              arg === 'float_window_font_small' ||
              arg === 'float_window_font_large'
            ) {
              const MIN_FONT_SIZE = 12;
              const MAX_FONT_SIZE = 50;
              const offset = arg === 'float_window_font_small' ? -1 : 1;
              $scope.floatWindowSetting.fontSize += offset;
              if ($scope.floatWindowSetting.fontSize < MIN_FONT_SIZE) {
                $scope.floatWindowSetting.fontSize = MIN_FONT_SIZE;
              } else if ($scope.floatWindowSetting.fontSize > MAX_FONT_SIZE) {
                $scope.floatWindowSetting.fontSize = MAX_FONT_SIZE;
              }
            } else if (
              arg === 'float_window_background_light' ||
              arg === 'float_window_background_dark'
            ) {
              const MIN_BACKGROUND_ALPHA = 0;
              const MAX_BACKGROUND_ALPHA = 1;
              const offset =
                arg === 'float_window_background_light' ? -0.1 : 0.1;
              $scope.floatWindowSetting.backgroundAlpha += offset;
              if (
                $scope.floatWindowSetting.backgroundAlpha < MIN_BACKGROUND_ALPHA
              ) {
                $scope.floatWindowSetting.backgroundAlpha =
                  MIN_BACKGROUND_ALPHA;
              } else if (
                $scope.floatWindowSetting.backgroundAlpha > MAX_BACKGROUND_ALPHA
              ) {
                $scope.floatWindowSetting.backgroundAlpha =
                  MAX_BACKGROUND_ALPHA;
              }
            } else if (arg === 'float_window_font_change_color') {
              const floatWindowlyricColors = [
                '#ffffff',
                '#65d29f',
                '#3c87eb',
                '#ec63af',
                '#4f5455',
                '#eb605b',
              ];
              const currentIndex = floatWindowlyricColors.indexOf(
                $scope.floatWindowSetting.color
              );
              const nextIndex =
                (currentIndex + 1) % floatWindowlyricColors.length;
              $scope.floatWindowSetting.color =
                floatWindowlyricColors[nextIndex];
            }
            localStorage.setObject(
              'float_window_setting',
              $scope.floatWindowSetting
            );

            const message = 'update_lyric_floating_window_css';
            window.listen1Desktop.control(
              message,
              getCSSStringFromSetting($scope.floatWindowSetting)
            );
          }
        )
      );
    }

    /**
     * 将当前播放器设置保存到既有本地存储键。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.saveLocalSettings = () => {
      localStorage.setObject('player-settings', $scope.settings);
    };

    /**
     * 循环切换页面播放模式，同步核心并持久化。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.changePlaymode = () => {
      const playmodeCount = 3;
      $scope.settings.playmode = ($scope.settings.playmode + 1) % playmodeCount;
      switchMode($scope.settings.playmode);
      $scope.saveLocalSettings();
    };

    $rootScope.openGithubAuth = GithubClient.github.openAuthUrl;
    /**
     * 退出 GitHub 授权并刷新页面状态文字。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $rootScope.GithubLogout = () => {
      GithubClient.github.logout();
      $scope.$evalAsync(
        /**
         * 进入此回调后，更新 $scope.githubStatus、$scope.githubStatusText，执行 GithubClient.github.getStatusText。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          $scope.githubStatus = 0;
          $scope.githubStatusText = GithubClient.github.getStatusText();
        }
      );
    };
    /**
     * 更新 GitHub 授权状态并将结果写入根作用域。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $rootScope.updateGithubStatus = () => {
      GithubClient.github.updateStatus(
        /**
         * 进入此回调后，执行 $scope.$evalAsync。
         * @param data 本次处理或转发的业务数据。
         * @returns {void} 无返回值。
         */
        (data) => {
          $scope.$evalAsync(
            /**
             * 进入此回调后，更新 $scope.githubStatus、$scope.githubStatusText，执行 GithubClient.github.getStatusText。
             * 无参数。
             * @returns {void} 无返回值。
             */
            () => {
              $scope.githubStatus = data;
              $scope.githubStatusText = GithubClient.github.getStatusText();
            }
          );
        }
      );
    };

    /**
     * 切换播放队列面板，并定位当前播放曲目。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.togglePlaylist = () => {
      const anchor = `song${l1Player.status.playing.id}`;
      $scope.menuHidden = !$scope.menuHidden;
      if (!$scope.menuHidden) {
        $anchorScroll(anchor);
      }
    };

    /**
     * 切换播放器静音状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.toggleMuteStatus = () => {
      // 静音入口实际执行状态切换。
      l1Player.toggleMute();
    };

    $scope.myProgress = 0;
    $scope.changingProgress = false;

    /**
     * 显示单曲当前无法播放的通知。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.copyrightNotice = () => {
      notyf.info(i18next.t('_COPYRIGHT_ISSUE'), true);
    };
    /**
     * 显示整个队列均不可播放的通知。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.failAllNotice = () => {
      notyf.warning(i18next.t('_FAIL_ALL_NOTICE'), true);
    };

    $rootScope.$on(
      'dragbar:myprogress',
      /**
       * 响应 "dragbar:myprogress" 事件，执行 $scope.$evalAsync。
       * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
       * @param data 本次处理或转发的业务数据。
       * @returns {void} 无返回值。
       */
      (event, data) => {
        $scope.$evalAsync(
          /**
           * 进入此回调后，更新 $scope.myProgress、$scope.currentPosition，执行 Math.floor。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            // 通过 Angular 更新周期刷新界面。
            $scope.myProgress = data;

            const posSec = Math.floor(
              ($scope.currentDurationSeconds * $scope.myProgress) / 100
            );
            const posStr = formatSecond(posSec);

            $scope.currentPosition = posStr;
          }
        );
      }
    );

    $rootScope.$on(
      'dragbar:changing_progress',
      /**
       * 响应 "dragbar:changing_progress" 事件，执行 $scope.$evalAsync。
       * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
       * @param data 本次处理或转发的业务数据。
       * @returns {void} 无返回值。
       */
      (event, data) => {
        $scope.$evalAsync(
          /**
           * 进入此回调后，更新 $scope.changingProgress。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            // 通过 Angular 更新周期刷新界面。
            $scope.changingProgress = data;
          }
        );
      }
    );

    /**
     * 按播放位置更新原文、译文高亮及悬浮窗口，暂停时也可强制刷新。
     * @param position 当前播放秒数。
     * @param force 是否立即发送当前原文与译文。
     * @returns {void} 无返回值。
     */
    function renderCurrentLyric(position, force = false) {
      const offsetMs =
        isElectron() && $scope.currentPlaying?.id
          ? window.Lyrics.getOffset($scope.currentPlaying.id)
          : 0;
      let original = null;
      let translation = null;
      $scope.lyricArray.forEach((line) => {
        if (Number(position) * 1000 >= line.seconds + offsetMs) {
          if (line.translationFlag) translation = line;
          else original = line;
        }
      });
      const changed = $scope.lyricLineNumber !== (original?.lineNumber ?? -1);
      $scope.lyricLineNumber = original?.lineNumber ?? -1;
      $scope.lyricLineNumberTrans = translation?.lineNumber ?? -1;
      if ((changed || force) && original) {
        const scroller = document.querySelector(
          '.playsong-detail .detail-songinfo .lyric'
        );
        const element = scroller?.querySelector(
          `[data-line="${original.lineNumber}"]`
        );
        if (element) {
          const height = useModernTheme()
            ? document.body.offsetHeight - 100
            : scroller.offsetHeight;
          smoothScrollTo(scroller, element.offsetTop - height / 2 + 30, 500);
        }
      }
      if (isElectron()) {
        const payload = {
          lyric: original
            ? original.content
            : $scope.currentPlaying?.title || '',
          tlyric:
            original &&
            translation &&
            $scope.enableLyricFloatingWindowTranslation
              ? translation.content
              : '',
        };
        const signature = JSON.stringify([$scope.currentPlaying?.id, payload]);
        if (force || signature !== lastFloatingLyric) {
          lastFloatingLyric = signature;
          window.listen1Desktop.setLyric(payload);
        }
      }
    }

    function loadLyrics(track) {
      lyricGeneration += 1;
      const generation = lyricGeneration;
      if (lyricRequest) lyricRequest.cancel();
      $scope.lastTrackId = track.id;
      $scope.lyricArray = [];
      $scope.lyricLineNumber = -1;
      $scope.lyricLineNumberTrans = -1;
      $scope.lyricError = '';
      renderCurrentLyric(0, true);
      const current = () =>
        !lyricDisposed &&
        generation === lyricGeneration &&
        $scope.currentPlaying?.id === track.id;
      lyricRequest = MediaService.getLyric(
        track.id,
        track.album_id,
        track.lyric_url,
        track.tlyric_url
      );
      lyricRequest
        .success((data) => {
          if (!current()) return;
          $scope.$evalAsync(() => {
            if (!current()) return;
            window.Lyrics.remember(track.id, data);
            $scope.lyricArray = window.Lyrics.parse(data?.lyric, data?.tlyric);
            const position =
              l1Player.status.playing?.id === track.id
                ? l1Player.status.playing.pos
                : 0;
            renderCurrentLyric(position || 0, true);
            l1Player.requestFrameUpdate();
          });
        })
        .error((error) => {
          if (!current() || error.code === 'CANCELLED') return;
          $scope.$evalAsync(() => {
            if (!current()) return;
            $scope.lyricError = i18next.t(`_ERROR_${error.code}`, {
              defaultValue: i18next.t('_ERROR_UNKNOWN'),
            });
          });
        });
    }

    $scope.retryLyrics = () => {
      if ($scope.currentPlaying?.id) loadLyrics($scope.currentPlaying);
    };
    $scope.$on('lyrics:changed', (event, trackId) => {
      window.Lyrics.forget(trackId);
      if (!lyricDisposed && $scope.currentPlaying?.id === trackId)
        loadLyrics($scope.currentPlaying);
    });
    $scope.$on('lyrics:offset-changed', (event, trackId) => {
      if (lyricDisposed || $scope.currentPlaying?.id !== trackId) return;
      $scope.$evalAsync(() => {
        if (lyricDisposed || $scope.currentPlaying?.id !== trackId) return;
        renderCurrentLyric(l1Player.status.playing?.pos || 0, true);
        l1Player.requestFrameUpdate();
      });
    });

    const mode =
      isElectron() || getLocalStorageValue('enable_stop_when_close', true)
        ? 'front'
        : 'background';

    getPlayer(mode).setMode(mode);
    if (mode === 'front') {
      if (!isElectron()) {
        // 切换到页面播放时停止后台实例，避免重复播放。
        getPlayerAsync(
          'background',
          /**
           * 进入此回调后，执行 player.pause。
           * @param player 当前模式下的播放核心实例；使用 pause 字段。
           * @returns {void} 无返回值。
           */
          (player) => {
            player.pause();
          }
        );
      }
    }

    const removePlayerListener = addPlayerListener(
      mode,
      /**
       * 进入此回调后，更新 windowHeight、$scope.lyricLineNumber、$scope.lyricLineNumberTrans、currentLyricTrans，执行 $scope.$evalAsync。
       * @param msg 播放器消息或通知内容；使用 type、data 字段。
       * @param sender 扩展消息的发送方信息；当前函数体未使用，保留调用签名。
       * @param sendResponse 用于应答扩展消息的函数。
       * @returns {void} 无返回值。
       */
      (msg, sender, sendResponse) => {
        $scope.$evalAsync();
        // 播放器事件是控制器播放状态的统一来源。
        // 页面操作通过 l1Player 发出命令，
        // 此处监听实际结果并回写 Angular 作用域。
        if (
          typeof msg.type === 'string' &&
          msg.type.split(':')[0] === 'BG_PLAYER'
        ) {
          switch (msg.type.split(':').slice(1).join('')) {
            case 'READY': {
              break;
            }
            case 'PLAY_FAILED': {
              notyf.warning(
                i18next.t(`_ERROR_${msg.data?.code || 'MEDIA_ERROR'}`),
                true
              );
              break;
            }

            case 'VOLUME': {
              $scope.$evalAsync(
                /**
                 * 进入此回调后，更新 $scope.volume。
                 * 无参数。
                 * @returns {void} 无返回值。
                 */
                () => {
                  $scope.volume = msg.data;
                }
              );
              break;
            }

            case 'FRAME_UPDATE': {
              // Reject frames from a track that has already been replaced.
              if (
                !$scope.currentPlaying?.id ||
                msg.data.id !== $scope.currentPlaying.id
              )
                break;
              renderCurrentLyric(msg.data.pos);

              // 曲目时长事件。
              (
                /**
                 * 进入此回调后，更新 $scope.currentDuration、$scope.currentDurationSeconds，执行 Math.floor。
                 * 无参数。
                 * @returns {void} 无返回值。
                 */
                () => {
                  const durationSec = Math.floor(msg.data.duration);
                  const durationStr = `${Math.floor(durationSec / 60)}:${`0${
                    durationSec % 60
                  }`.substr(-2)}`;
                  if (
                    msg.data.duration === 0 ||
                    $scope.currentDuration === durationStr
                  ) {
                    return;
                  }
                  $scope.currentDuration = durationStr;
                  $scope.currentDurationSeconds = msg.data.duration;
                }
              )();

              // 播放进度事件。
              if ($scope.changingProgress === false) {
                $scope.$evalAsync(
                  /**
                   * 进入此回调后，更新 $scope.myProgress、$scope.currentPosition，执行 Math.floor。
                   * 无参数。
                   * @returns {void} 无返回值。
                   */
                  () => {
                    if (msg.data.duration === 0) {
                      $scope.myProgress = 0;
                    } else {
                      $scope.myProgress =
                        (msg.data.pos / msg.data.duration) * 100;
                    }
                    const posSec = Math.floor(msg.data.pos);
                    const posStr = formatSecond(posSec);
                    $scope.currentPosition = posStr;
                  }
                );
              }
              break;
            }

            case 'LOAD': {
              $scope.currentPlaying = msg.data.currentPlaying;
              const { length, index } = msg.data.playlist;

              if (useModernTheme()) {
                $scope.currentIndex = index;
                $scope.refreshStage(index, length);
              }

              if (useModernTheme()) {
                const rotatemark = document.getElementById('rotatemark');
                const circlmark = document.getElementById('circlmark');
                if (rotatemark !== null && circlmark !== null) {
                  circlmark.classList.add('circlmark');
                  rotatemark.classList.add('rotatemark');
                  /**
                   * 在圆环动画结束后移除一次性动画状态。
                   * 无参数。
                   * @returns {void} 无返回值。
                   */
                  circlmark.onanimationend = () => {
                    circlmark.classList.remove('circlmark');
                  };
                  /**
                   * 在旋转过渡结束后移除一次性动画状态。
                   * 无参数。
                   * @returns {void} 无返回值。
                   */
                  rotatemark.onanimationend = () => {
                    rotatemark.classList.remove('rotatemark');
                  };
                }
              }

              const track = msg.data.currentPlaying;
              if (track.id === undefined) {
                lyricGeneration += 1;
                if (lyricRequest) lyricRequest.cancel();
                $scope.lastTrackId = null;
                $scope.lyricArray = [];
                $scope.lyricError = '';
                renderCurrentLyric(0, true);
                break;
              }
              $scope.currentPlaying.platformText = i18next.t(track.platform);
              $rootScope.page_title = {
                title: track.title,
                artist: track.artist,
                status: $scope.isPlaying ? 'playing' : 'paused',
              };
              $rootScope.document_title =
                ($scope.isPlaying ? '▶ ' : '❚❚ ') +
                track.title +
                (track.artist ? ` - ${track.artist}` : '');
              if (isElectron()) window.listen1Desktop.setTrack(track);
              // Metadata-only LOAD events must not restart lyrics or progress.
              if ($scope.lastTrackId === track.id) break;
              $scope.myProgress = 0;
              const current = localStorage.getObject('player-settings') || {};
              current.nowplaying_track_id = track.id;
              localStorage.setObject('player-settings', current);
              const scroller = document.querySelector(
                '.playsong-detail .detail-songinfo .lyric'
              );
              if (scroller) smoothScrollTo(scroller, 0, 300);
              if (lastfm.isAuthorized())
                lastfm.sendNowPlaying(track.title, track.artist, () => {});
              loadLyrics(track);
              break;
            }

            case 'MUTE': {
              // 静音状态事件。
              $scope.$evalAsync(
                /**
                 * 进入此回调后，更新 $scope.mute。
                 * 无参数。
                 * @returns {void} 无返回值。
                 */
                () => {
                  $scope.mute = msg.data;
                }
              );
              break;
            }

            case 'PLAYLIST': {
              // 队列快照事件。
              $scope.$evalAsync(
                /**
                 * 进入此回调后，更新 $scope.playlist，执行 localStorage.setObject（"current-playing"）。
                 * 无参数。
                 * @returns {void} 无返回值。
                 */
                () => {
                  $scope.playlist = msg.data;
                  $scope.refreshStage();
                  localStorage.setObject('current-playing', msg.data);
                }
              );

              break;
            }

            case 'PLAY_STATE': {
              // 播放状态事件。
              $scope.$evalAsync(
                /**
                 * 进入此回调后，更新 $scope.isPlaying。
                 * 无参数。
                 * @returns {void} 无返回值。
                 */
                () => {
                  $scope.isPlaying = !!msg.data.isPlaying;
                }
              );
              let title = 'Listen 1';
              if ($rootScope.page_title !== undefined) {
                title = '';
                if (msg.data.isPlaying) {
                  $rootScope.page_title.status = 'playing';
                } else {
                  $rootScope.page_title.status = 'paused';
                }
                if ($rootScope.page_title.status !== '') {
                  if ($rootScope.page_title.status === 'playing') {
                    title += '▶ ';
                  } else if ($rootScope.page_title.status === 'paused') {
                    title += '❚❚ ';
                  }
                }
                title += $rootScope.page_title.title;
                if ($rootScope.page_title.artist !== '') {
                  title += ` - ${$rootScope.page_title.artist}`;
                }
              }

              $rootScope.document_title = title;
              if (isElectron()) {
                if (msg.data.isPlaying) {
                  window.listen1Desktop.setPlaying(true);
                } else {
                  window.listen1Desktop.setPlaying(false);
                }
              }

              if (msg.data.reason === 'Ended') {
                if (!lastfm.isAuthorized()) {
                  break;
                }
                // 提交 Last.fm 收听记录。
                const track = l1Player.getTrackById(l1Player.status.playing.id);
                lastfm.scrobble(
                  l1Player.status.playing.playedFrom,
                  track.title,
                  track.artist,
                  track.album,
                  /**
                   * 保留的空回调，此处无需继续处理或改变状态。
                   * 无参数。
                   * @returns {void} 无返回值。
                   */
                  () => {}
                );
              }

              break;
            }
            case 'RETRIEVE_URL_SUCCESS': {
              $scope.currentPlaying = msg.data;
              // 设置变化时同步翻译显示。
              $scope.currentPlaying.platformText = i18next.t(
                $scope.currentPlaying.platform
              );
              break;
            }
            case 'RETRIEVE_URL_FAIL': {
              notyf.warning(
                i18next.t(
                  `_ERROR_${msg.data.error?.code || 'RESOURCE_UNAVAILABLE'}`
                ),
                true
              );
              break;
            }
            case 'RETRIEVE_URL_FAIL_ALL': {
              $scope.failAllNotice();
              break;
            }
            default:
              break;
          }
        }
        if (sendResponse !== undefined) {
          sendResponse();
        }
      }
    );

    $scope.$on('$destroy', removePlayerListener);

    // 所有监听安装完成后再连接播放器，避免漏掉初始快照。
    l1Player.connectPlayer();

    // 注册键盘快捷键。
    const shortcutBindings = [];
    /**
     * 注册键盘动作并保存注销所需信息，作用域销毁时统一清理。
     * @param key 索引、配置或字段名称。
     * @param action 快捷键触发后执行的动作。
     * @returns {void} 无返回值。
     */
    const bindShortcut = (key, action) => {
      /**
       * 在作用域有效时执行快捷键动作，并触发 Angular 页面更新。
       * @param ...args 传递给包装函数的参数。
       * @returns {*} action 回调的直接返回值。
       */
      const handler = (...args) => action(...args);
      hotkeys(key, handler);
      shortcutBindings.push({ key, handler });
    };
    $scope.$on(
      '$destroy',
      /**
       * 响应 "$destroy" 事件，执行 shortcutBindings.forEach。
       * 无参数。
       * @returns {*} shortcutBindings.forEach 的调用结果。
       */
      () =>
        shortcutBindings.forEach(
          /**
           * 逐项处理 shortcutBindings 中的条目，hotkeys.unbind 的调用结果。
           * @param options 来自 shortcutBindings 的当前条目；解构参数，包含 key（索引、配置或字段名称）、handler（处理单个条目的函数）。
           * @returns {*} hotkeys.unbind 的调用结果。
           */
          ({ key, handler }) => hotkeys.unbind(key, handler)
        )
    );
    // 停用代码，保留供历史对照：
    // description: '播放/暂停',
    bindShortcut('p', l1Player.togglePlayPause);

    // 停用代码，保留供历史对照：
    // description: '上一首',
    bindShortcut('[', l1Player.prev);

    // 停用代码，保留供历史对照：
    // description: '下一首',
    bindShortcut(']', l1Player.next);

    // 停用代码，保留供历史对照：
    // description: '静音/取消静音',
    bindShortcut('m', l1Player.toggleMute);

    // 停用代码，保留供历史对照：
    // description: '打开/关闭播放列表',
    bindShortcut('l', $scope.togglePlaylist);

    // 停用代码，保留供历史对照：
    // description: '切换播放模式（顺序/随机/单曲循环）',
    bindShortcut('s', $scope.changePlaymode);

    // 停用代码，保留供历史对照：
    // description: '音量增加',
    bindShortcut(
      'u',
      /**
       * 进入此回调后，执行 $timeout。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        $timeout(
          /**
           * 进入此回调后，执行 l1Player.adjustVolume。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            l1Player.adjustVolume(true);
          }
        );
      }
    );

    // 停用代码，保留供历史对照：
    // description: '音量减少',
    bindShortcut(
      'd',
      /**
       * 进入此回调后，执行 $timeout。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        $timeout(
          /**
           * 进入此回调后，执行 l1Player.adjustVolume。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            l1Player.adjustVolume(false);
          }
        );
      }
    );

    /**
     * 切换页面译文显示并保存设置。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.toggleLyricTranslation = () => {
      $scope.enableLyricTranslation = !$scope.enableLyricTranslation;
      localStorage.setObject(
        'enable_lyric_translation',
        $scope.enableLyricTranslation
      );
    };

    /**
     * 切换悬浮译文显示，更新歌词窗口和持久化设置。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.toggleLyricFloatingWindowTranslation = () => {
      $scope.enableLyricFloatingWindowTranslation =
        !$scope.enableLyricFloatingWindowTranslation;
      localStorage.setObject(
        'enable_lyric_floating_window_translation',
        $scope.enableLyricFloatingWindowTranslation
      );
      renderCurrentLyric(l1Player.status.playing?.pos || 0, true);
      l1Player.requestFrameUpdate();
    };

    if (isElectron()) {
      $scope.$on(
        '$destroy',
        window.listen1Desktop.on(
          'globalShortcut',
          /**
           * 响应 "globalShortcut" 事件，执行 l1Player.next。
           * @param message 待转发的消息或文本。
           * @returns {void} 无返回值。
           */
          (message) => {
            if (message === 'right') {
              l1Player.next();
            } else if (message === 'left') {
              l1Player.prev();
            } else if (message === 'space') {
              l1Player.togglePlayPause();
            }
          }
        )
      );
    }

    /**
     * 切换自动备用来源功能并保存开关。
     * @param toggle 是否切换当前开关状态。
     * @returns {void} 无返回值。
     */
    $scope.setAutoChooseSource = (toggle) => {
      if (toggle === true) {
        $scope.enableAutoChooseSource = !$scope.enableAutoChooseSource;
      }
      localStorage.setObject(
        'enable_auto_choose_source',
        $scope.enableAutoChooseSource
      );
    };

    /**
     * 将音乐来源加入备用列表并去重保存。
     * @param source 音乐来源名称。
     * @returns {void} 无返回值。
     */
    $scope.enableSource = (source) => {
      if ($scope.autoChooseSourceList.indexOf(source) > -1) {
        return;
      }
      $scope.autoChooseSourceList = [...$scope.autoChooseSourceList, source];
      localStorage.setObject(
        'auto_choose_source_list',
        $scope.autoChooseSourceList
      );
    };

    /**
     * 从备用来源列表移除指定来源。
     * @param source 音乐来源名称。
     * @returns {void} 无返回值。
     */
    $scope.disableSource = (source) => {
      if ($scope.autoChooseSourceList.indexOf(source) === -1) {
        return;
      }
      $scope.autoChooseSourceList = $scope.autoChooseSourceList.filter(
        /**
         * 筛选检查 $scope.autoChooseSourceList 中的条目，i 是否不等于 source。
         * @param i 来自 $scope.autoChooseSourceList 的当前条目。
         * @returns {boolean} i 是否不等于 source。
         */
        (i) => i !== source
      );
      localStorage.setObject(
        'auto_choose_source_list',
        $scope.autoChooseSourceList
      );
    };

    /**
     * 保存扩展页面关闭时是否停止播放的选项。
     * @param status 当前操作或来源的状态值。
     * @returns {void} 无返回值。
     */
    $scope.setStopWhenClose = (status) => {
      $scope.enableStopWhenClose = status;
      localStorage.setObject(
        'enable_stop_when_close',
        $scope.enableStopWhenClose
      );
    };

    /**
     * 切换正在播放页的封面背景并保存。
     * @param toggle 是否切换当前开关状态。
     * @returns {void} 无返回值。
     */
    $scope.setNowplayingCoverBackground = (toggle) => {
      if (toggle === true) {
        $scope.enableNowplayingCoverBackground =
          !$scope.enableNowplayingCoverBackground;
      }
      localStorage.setObject(
        'enable_nowplaying_cover_background',
        $scope.enableNowplayingCoverBackground
      );
    };
    /**
     * 切换码率徽标显示并保存。
     * @param toggle 是否切换当前开关状态。
     * @returns {void} 无返回值。
     */
    $scope.setNowplayingBitrate = (toggle) => {
      if (toggle === true) {
        $scope.enableNowplayingBitrate = !$scope.enableNowplayingBitrate;
      }
      localStorage.setObject(
        'enable_nowplaying_bitrate',
        $scope.enableNowplayingBitrate
      );
    };
    /**
     * 切换实际播放平台徽标显示并保存。
     * @param toggle 是否切换当前开关状态。
     * @returns {void} 无返回值。
     */
    $scope.setNowplayingPlatform = (toggle) => {
      if (toggle === true) {
        $scope.enableNowplayingPlatform = !$scope.enableNowplayingPlatform;
      }
      localStorage.setObject(
        'enable_nowplaying_platform',
        $scope.enableNowplayingPlatform
      );
    };
  },
]);
