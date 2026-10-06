/**
 * 文件职责：提供页面使用的播放命令门面，将音量百分比和播放模式转换为核心接口，并维护事件驱动的状态快照。
 *
 * 文件级定义：
 * - mode：当前播放环境选择，决定访问页面还是扩展后台核心。
 * - myPlayer：当前模式的播放器引用，供页面播放门面使用。
 * - l1Player：页面播放命令与最近状态快照的共享门面。
 * - l1Player.play：把播放命令交给当前模式的播放器。
 * - l1Player.pause：把暂停命令交给当前模式的播放器。
 * - l1Player.togglePlayPause：查询核心播放状态后执行暂停或恢复。
 * - l1Player.playById：按曲目 ID 请求播放。
 * - l1Player.loadById：按曲目 ID 请求加载，形参 idx 在这里作为 ID 使用。
 * - l1Player.seek：按 0 至 1 的比例请求跳转。
 * - l1Player.next：请求下一首曲目。
 * - l1Player.prev：请求上一首曲目。
 * - l1Player.random：请求随机切歌。
 * - l1Player.setLoopMode：将页面传入的循环模式交给核心设置器。
 * - l1Player.mute：请求全局静音。
 * - l1Player.unmute：请求取消全局静音。
 * - l1Player.toggleMute：按当前静音状态执行反向切换。
 * - l1Player.setVolume：将页面 0 至 100 的音量百分比换算为核心的 0 至 1。
 * - l1Player.adjustVolume：请求核心按固定步长增加或降低音量。
 * - l1Player.addTrack：追加一首曲目，由核心负责去重。
 * - l1Player.insertTrack：将曲目移动或插入到目标曲目前后。
 * - l1Player.removeTrack：按队列索引移除曲目。
 * - l1Player.addTracks：批量追加曲目，由核心统一发出队列快照。
 * - l1Player.clearPlaylist：清空播放队列及关联音频。
 * - l1Player.setNewPlaylist：用指定列表替换播放队列。
 * - l1Player.getTrackById：从最近的队列快照按 ID 查找曲目。
 * - l1Player.connectPlayer：连接播放器，仅在空闲且队列为空时恢复旧队列和选中曲目，再请求完整状态快照。
 * - l1Player.injectDirectives：注册播放、暂停、切歌、清空和删除等点击指令，使模板通过门面访问核心。
 */
/* eslint-disable no-param-reassign */
/* global isElectron getPlayer getPlayerAsync addPlayerListener getLocalStorageValue */
{
  /**
   * mode：当前播放环境选择，决定访问页面还是扩展后台核心；类型为 string。
   * @type {string}
   */
  const mode =
    isElectron() || getLocalStorageValue('enable_stop_when_close', true)
      ? 'front'
      : 'background';

  /**
   * myPlayer：当前模式的播放器引用，供页面播放门面使用；类型为 Player。
   * @type {Player}
   */
  const myPlayer = getPlayer(mode);
  // l1Player 是页面使用的播放命令门面，
  // 按当前模式访问页面或后台播放器；
  // 下方播放器事件持续维护 status，供模板同步读取。
  /**
   * l1Player：页面播放命令与最近状态快照的共享门面；类型为 Object。
   * @type {Object}
   */
  const l1Player = {
    status: {
      muted: myPlayer.muted,
      volume: myPlayer.volume * 100,
      loop_mode: myPlayer.loop_mode,
      playing: myPlayer.playing,
    },
    /**
     * 把播放命令交给当前模式的播放器。
     * 无参数。
     * @returns {void} 无返回值。
     */
    play() {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.play。
         * @param player 当前模式下的播放核心实例；使用 play 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.play();
        }
      );
    },
    /**
     * 把暂停命令交给当前模式的播放器。
     * 无参数。
     * @returns {void} 无返回值。
     */
    pause() {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.pause。
         * @param player 当前模式下的播放核心实例；使用 pause 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.pause();
        }
      );
    },
    /**
     * 查询核心播放状态后执行暂停或恢复。
     * 无参数。
     * @returns {void} 无返回值。
     */
    togglePlayPause() {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.pause。
         * @param player 当前模式下的播放核心实例；使用 playing、pause、play 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          if (player.playing) {
            player.pause();
          } else {
            player.play();
          }
        }
      );
    },
    /**
     * 按曲目 ID 请求播放。
     * @param id 目标条目的唯一标识。
     * @returns {void} 无返回值。
     */
    playById(id) {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.playById。
         * @param player 当前模式下的播放核心实例；使用 playById 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.playById(id);
        }
      );
    },
    /**
     * 按曲目 ID 请求加载，形参 idx 在这里作为 ID 使用。
     * @param idx 目标队列索引。
     * @returns {void} 无返回值。
     */
    loadById(idx) {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.loadById。
         * @param player 当前模式下的播放核心实例；使用 loadById 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.loadById(idx);
        }
      );
    },
    /**
     * 按 0 至 1 的比例请求跳转。
     * @param per 0 至 1 的比例，页面音量门面另使用 0 至 100。
     * @returns {void} 无返回值。
     */
    seek(per) {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.seek。
         * @param player 当前模式下的播放核心实例；使用 seek 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.seek(per);
        }
      );
    },
    /**
     * 请求下一首曲目。
     * 无参数。
     * @returns {void} 无返回值。
     */
    next() {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.skip（"next"）。
         * @param player 当前模式下的播放核心实例；使用 skip 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.skip('next');
        }
      );
    },
    /**
     * 请求上一首曲目。
     * 无参数。
     * @returns {void} 无返回值。
     */
    prev() {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.skip（"prev"）。
         * @param player 当前模式下的播放核心实例；使用 skip 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.skip('prev');
        }
      );
    },
    /**
     * 请求随机切歌。
     * 无参数。
     * @returns {void} 无返回值。
     */
    random() {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.skip（"random"）。
         * @param player 当前模式下的播放核心实例；使用 skip 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.skip('random');
        }
      );
    },
    /**
     * 将页面传入的循环模式交给核心设置器。
     * @param input 待校验或转换的输入值。
     * @returns {void} 无返回值。
     */
    setLoopMode(input) {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，更新 player.loop_mode。
         * @param player 当前模式下的播放核心实例；使用 loop_mode 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.loop_mode = input;
        }
      );
    },
    /**
     * 请求全局静音。
     * 无参数。
     * @returns {void} 无返回值。
     */
    mute() {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.mute。
         * @param player 当前模式下的播放核心实例；使用 mute 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.mute();
        }
      );
    },
    /**
     * 请求取消全局静音。
     * 无参数。
     * @returns {void} 无返回值。
     */
    unmute() {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.unmute。
         * @param player 当前模式下的播放核心实例；使用 unmute 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.unmute();
        }
      );
    },
    /**
     * 按当前静音状态执行反向切换。
     * 无参数。
     * @returns {void} 无返回值。
     */
    toggleMute() {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.unmute。
         * @param player 当前模式下的播放核心实例；使用 muted、unmute、mute 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          if (player.muted) player.unmute();
          else player.mute();
        }
      );
    },
    /**
     * 将页面 0 至 100 的音量百分比换算为核心的 0 至 1。
     * @param per 0 至 100 的音量百分比。
     * @returns {void} 无返回值。
     */
    setVolume(per) {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，更新 player.volume。
         * @param player 当前模式下的播放核心实例；使用 volume 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.volume = per / 100;
        }
      );
    },
    /**
     * 请求核心按固定步长增加或降低音量。
     * @param increase 是否增加音量；否则降低。
     * @returns {void} 无返回值。
     */
    adjustVolume(increase) {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.adjustVolume。
         * @param player 当前模式下的播放核心实例；使用 adjustVolume 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.adjustVolume(increase);
        }
      );
    },
    /**
     * 追加一首曲目，由核心负责去重。
     * @param track 统一曲目对象，包含用于路由和查找的 ID。
     * @returns {void} 无返回值。
     */
    addTrack(track) {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.insertAudio。
         * @param player 当前模式下的播放核心实例；使用 insertAudio 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.insertAudio(track);
        }
      );
    },
    /**
     * 将曲目移动或插入到目标曲目前后。
     * @param track 统一曲目对象，包含用于路由和查找的 ID。
     * @param to_track 作为插入位置参照的目标曲目。
     * @param direction 插入或切换方向，使用调用方约定的前后标记。
     * @returns {void} 无返回值。
     */
    insertTrack(track, to_track, direction) {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.insertAudioByDirection。
         * @param player 当前模式下的播放核心实例；使用 insertAudioByDirection 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.insertAudioByDirection(track, to_track, direction);
        }
      );
    },
    /**
     * 按队列索引移除曲目。
     * @param index 当前条目的零起点索引。
     * @returns {void} 无返回值。
     */
    removeTrack(index) {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.removeAudio。
         * @param player 当前模式下的播放核心实例；使用 removeAudio 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.removeAudio(index);
        }
      );
    },
    /**
     * 批量追加曲目，由核心统一发出队列快照。
     * @param list 待应用的曲目数组。
     * @returns {void} 无返回值。
     */
    addTracks(list) {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.appendAudioList。
         * @param player 当前模式下的播放核心实例；使用 appendAudioList 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.appendAudioList(list);
        }
      );
    },
    /**
     * 清空播放队列及关联音频。
     * 无参数。
     * @returns {void} 无返回值。
     */
    clearPlaylist() {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.clearPlaylist。
         * @param player 当前模式下的播放核心实例；使用 clearPlaylist 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.clearPlaylist();
        }
      );
    },
    /**
     * 用指定列表替换播放队列。
     * @param list 待应用的曲目数组。
     * @returns {void} 无返回值。
     */
    setNewPlaylist(list) {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.setNewPlaylist。
         * @param player 当前模式下的播放核心实例；使用 setNewPlaylist 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          player.setNewPlaylist(list);
        }
      );
    },
    /**
     * 从最近的队列快照按 ID 查找曲目；无快照返回 null，未匹配可能返回 undefined。
     * @param id 目标条目的唯一标识。
     * @returns {*} null；其他分支返回 首个匹配条目，未匹配时为 undefined。
     */
    getTrackById(id) {
      if (!l1Player.status.playlist) return null;
      return l1Player.status.playlist.find(
        /**
         * 筛选检查 l1Player.status.playlist 中的条目，track.id 是否严格等于 id。
         * @param track 来自 l1Player.status.playlist 的当前条目；使用 id 字段。
         * @returns {boolean} track.id 是否严格等于 id。
         */
        (track) => track.id === id
      );
    },
    /**
     * 连接播放器，仅在空闲且队列为空时恢复旧队列和选中曲目，再请求完整状态快照。
     * 无参数。
     * @returns {void} 无返回值。
     */
    connectPlayer() {
      getPlayerAsync(
        mode,
        /**
         * 进入此回调后，执行 player.sendPlaylistEvent。
         * @param player 当前模式下的播放核心实例；使用 playing、playlist、setNewPlaylist、loadById、sendPlaylistEvent、sendPlayingEvent、sendLoadEvent 字段。
         * @returns {void} 无返回值。
         */
        (player) => {
          if (!player.playing) {
            // 仅在播放器空闲且队列为空时恢复本地队列，
            // 已有后台播放状态继续由正在运行的核心维护。
            if (!player.playlist.length) {
              const localCurrentPlaying =
                localStorage.getObject('current-playing');
              if (Array.isArray(localCurrentPlaying)) {
                const tracks = localCurrentPlaying.filter(
                  /**
                   * 筛选检查 localCurrentPlaying 中的条目，统一曲目对象 track 且 typeof track.id 是否严格等于 "string"。
                   * @param track 来自 localCurrentPlaying 的当前条目；使用 id 字段。
                   * @returns {*} 统一曲目对象 track 且 typeof track.id 是否严格等于 "string"。
                   */
                  (track) => track && typeof track.id === 'string'
                );
                tracks.forEach(
                  /**
                   * 逐项处理 tracks 中的条目，更新 i.disabled。
                   * @param i 来自 tracks 的当前条目；使用 disabled 字段。
                   * @returns {void} 无返回值。
                   */
                  (i) => {
                    i.disabled = false;
                  }
                );
                player.setNewPlaylist(tracks);
              }
            }

            const localPlayerSettings =
              localStorage.getObject('player-settings');
            if (localPlayerSettings !== null) {
              player.loadById(localPlayerSettings.nowplaying_track_id);
            }
          }

          player.sendPlaylistEvent();
          player.sendPlayingEvent();
          player.sendLoadEvent();
        }
      );
    },
  };

  // 将轻量点击指令放在播放门面旁，
  // 使模板通过相同接口使用页面或后台播放。
  /**
   * 注册播放、暂停、切歌、清空和删除等点击指令，使模板通过门面访问核心。
   * @param ngApp 待注册播放指令的 Angular 模块；使用 directive 字段。
   * @returns {void} 无返回值。
   */
  l1Player.injectDirectives = (ngApp) => {
    ngApp.directive(
      'playFromPlaylist',
      /**
       * 构造 playFromPlaylist 指令定义，将模板元素连接到相应页面或播放器操作。
       * 无参数。
       * @returns {Object} 包含 restrict、scope、link 的对象。
       */
      () => ({
        restrict: 'EA',
        scope: {
          song: '=playFromPlaylist',
        },
        /**
         * 链接当前指令的作用域和 DOM，执行 element.bind（"click"）。
         * @param scope 当前指令的 Angular 作用域；使用 song 字段。
         * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
         * @returns {void} 无返回值。
         */
        link(scope, element) {
          element.bind(
            'click',
            /**
             * 响应 "click" 事件，执行 l1Player.playById。
             * 无参数。
             * @returns {void} 无返回值。
             */
            () => {
              l1Player.playById(scope.song.id);
            }
          );
        },
      })
    );

    ngApp.directive(
      'nextTrack',
      /**
       * 构造 nextTrack 指令定义，将模板元素连接到相应页面或播放器操作。
       * 无参数。
       * @returns {Object} 包含 restrict、link 的对象。
       */
      () => ({
        restrict: 'EA',
        /**
         * 链接当前指令的作用域和 DOM，执行 element.bind（"click"）。
         * @param scope 当前指令的 Angular 作用域；当前函数体未使用，保留调用签名。
         * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
         * @returns {void} 无返回值。
         */
        link(scope, element) {
          element.bind(
            'click',
            /**
             * 响应 "click" 事件，执行 l1Player.next。
             * 无参数。
             * @returns {void} 无返回值。
             */
            () => {
              l1Player.next();
            }
          );
        },
      })
    );

    ngApp.directive(
      'prevTrack',
      /**
       * 构造 prevTrack 指令定义，将模板元素连接到相应页面或播放器操作。
       * 无参数。
       * @returns {Object} 包含 restrict、link 的对象。
       */
      () => ({
        restrict: 'EA',
        /**
         * 链接当前指令的作用域和 DOM，执行 element.bind（"click"）。
         * @param scope 当前指令的 Angular 作用域；当前函数体未使用，保留调用签名。
         * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
         * @returns {void} 无返回值。
         */
        link(scope, element) {
          element.bind(
            'click',
            /**
             * 响应 "click" 事件，执行 l1Player.prev。
             * 无参数。
             * @returns {void} 无返回值。
             */
            () => {
              l1Player.prev();
            }
          );
        },
      })
    );

    ngApp.directive(
      'clearPlaylist',
      /**
       * 构造 clearPlaylist 指令定义，将模板元素连接到相应页面或播放器操作。
       * 无参数。
       * @returns {Object} 包含 restrict、link 的对象。
       */
      () => ({
        restrict: 'EA',
        /**
         * 链接当前指令的作用域和 DOM，执行 element.bind（"click"）。
         * @param scope 当前指令的 Angular 作用域；当前函数体未使用，保留调用签名。
         * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
         * @returns {void} 无返回值。
         */
        link(scope, element) {
          element.bind(
            'click',
            /**
             * 响应 "click" 事件，执行 l1Player.clearPlaylist。
             * 无参数。
             * @returns {void} 无返回值。
             */
            () => {
              l1Player.clearPlaylist();
            }
          );
        },
      })
    );

    ngApp.directive(
      'removeFromPlaylist',
      /**
       * 构造 removeFromPlaylist 指令定义，将模板元素连接到相应页面或播放器操作。
       * 无参数。
       * @returns {Object} 包含 restrict、scope、link 的对象。
       */
      () => ({
        restrict: 'EA',
        scope: {
          song: '=removeFromPlaylist',
        },
        /**
         * 链接当前指令的作用域和 DOM，执行 element.bind（"click"）。
         * @param scope 当前指令的 Angular 作用域；当前函数体未使用，保留调用签名。
         * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
         * @param attrs 指令所在元素的属性集合；使用 index 字段。
         * @returns {void} 无返回值。
         */
        link(scope, element, attrs) {
          element.bind(
            'click',
            /**
             * 响应 "click" 事件，执行 l1Player.removeTrack。
             * 无参数。
             * @returns {void} 无返回值。
             */
            () => {
              l1Player.removeTrack(attrs.index);
            }
          );
        },
      })
    );

    ngApp.directive(
      'playPauseToggle',
      /**
       * 构造 playPauseToggle 指令定义，将模板元素连接到相应页面或播放器操作。
       * 无参数。
       * @returns {Object} 包含 restrict、link 的对象。
       */
      () => ({
        restrict: 'EA',
        /**
         * 链接当前指令的作用域和 DOM，执行 element.bind（"click"）。
         * @param scope 当前指令的 Angular 作用域；当前函数体未使用，保留调用签名。
         * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
         * @returns {void} 无返回值。
         */
        link(scope, element) {
          element.bind(
            'click',
            /**
             * 响应 "click" 事件，执行 l1Player.togglePlayPause。
             * 无参数。
             * @returns {void} 无返回值。
             */
            () => {
              l1Player.togglePlayPause();
            }
          );
        },
      })
    );
  };

  addPlayerListener(
    mode,
    /**
     * 进入此回调后，更新 l1Player.status.playing、l1Player.status.playlist，执行 res。
     * @param msg 播放器消息或通知内容；使用 type、data 字段。
     * @param sender 扩展消息的发送方信息；当前函数体未使用，保留调用签名。
     * @param res 异步响应或消息应答函数，按调用位置使用。
     * @returns {void} 无返回值。
     */
    (msg, sender, res) => {
      if (msg.type === 'BG_PLAYER:FRAME_UPDATE') {
        l1Player.status.playing = {
          ...l1Player.status.playing,
          ...msg.data,
        };
      } else if (msg.type === 'BG_PLAYER:PLAYLIST') {
        l1Player.status.playlist = msg.data || [];
      }
      if (res !== undefined) {
        res();
      }
    }
  );

  window.l1Player = l1Player;
}
