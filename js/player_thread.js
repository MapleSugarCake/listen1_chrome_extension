/**
 * 文件职责：在当前渲染环境中维护播放队列和 Howler 实例，处理地址解析、过期缓存、切歌取消与媒体事件同步。
 *
 * 文件级定义：
 * - Player：持有播放队列、Howler 实例和异步请求代次；创建时启动进度定时器，队列替换与清空时释放音频资源。
 * - Player.constructor：初始化空队列、播放代次、五分钟地址缓存和默认刷新计时器。
 * - Player.cancelPending：推进播放代次，取消当前地址请求并清理加载超时，令迟到回调失效。
 * - Player.setMode：切换播放器消息发送目标，后续事件按新模式路由。
 * - Player.setRefreshRate：清理旧进度计时器，再按每秒刷新次数创建新计时器。
 * - Player.currentAudio：读取当前索引对应的曲目。
 * - Player.currentHowl：读取当前曲目的 Howl 实例。
 * - Player.playing：查询当前音频是否正在播放，没有实例时返回 false。
 * - Player.muted：读取 Howler 的全局静音状态。
 * - Player.insertAudio：按 ID 去重后插入单首曲目，必要时移动当前索引并发送队列快照。
 * - Player.array_move：在同一数组内移动元素，目标超出长度时先补空位。
 * - Player.insertAudioByDirection：将曲目放到目标曲目前后，重排后仍按 ID 保留当前播放曲目。
 * - Player.removeAudio：移除队列曲目并释放其音频和缓存。
 * - Player.appendAudioList：过滤无效或重复 ID 后批量追加，只发送一次完整队列快照。
 * - Player.clearPlaylist：取消请求、卸载音频并清空队列与索引，按 notify 决定是否广播清空结果。
 * - Player.stopAll：停止队列中已有的所有 Howl 实例。
 * - Player.unloadAll：卸载 Howler 音频并清除曲目对原生实例的引用。
 * - Player.setNewPlaylist：清理旧队列、过滤无效及重复 ID 后替换列表，加载首项并广播新的完整快照。
 * - Player.playById：查找曲目 ID，再按索引执行播放。
 * - Player.loadById：查找曲目 ID，取消旧请求后加载该项但不自动播放。
 * - Player.play：选择有效索引，检查地址缓存是否过期，再解析地址或使用已有地址播放。
 * - Player.retrieveMediaUrl：为当前曲目请求播放地址，共享同曲目的在途请求。
 * - Player.load：切换当前曲目并停止其他音频，广播加载事件，防止多首同时播放。
 * - Player.finishLoad：创建或复用 HTML5 Howl，绑定受播放代次保护的事件。
 * - Player.pause：暂停当前音频并推送暂停状态。
 * - Player.skip：按顺序或随机映射选择前后曲目，跳过禁用项。
 * - Player.loop_mode：接受 all、one、shuffle 名称或对应的 0、1、2 编号更新循环模式。
 * - Player.loop_mode：读取当前播放循环模式，不修改队列或播放位置。
 * - Player.volume：把数值交给 Howler 设置全局音量，并发送音量及播放帧事件。
 * - Player.volume：读取 Howler 的全局音量，供页面状态同步与音量调整使用。
 * - Player.adjustVolume：按 0.1 的步长增减音量，并限制在 0 至 1。
 * - Player.mute：开启全局静音并通知音量状态。
 * - Player.unmute：关闭全局静音并通知音量状态。
 * - Player.seek：将 0 至 1 的播放比例换算为秒并跳转，随后推送进度。
 * - Player.seekTime：以秒为单位跳转当前音频，并推送新进度。
 * - Player.formatTime：将秒数向下取整并格式化为分钟与两位秒数。
 * - Player.setMediaURI：按曲目 ID 缓存播放 URL，并写入五分钟后的过期时间。
 * - Player.setAudioDisabled：修改指定队列项的禁用标记。
 * - Player.sendFrameUpdate：向页面推送当前秒数、时长和进度比例，并更新媒体会话位置。
 * - Player.sendPlayingEvent：推送播放状态及触发原因。
 * - Player.sendLoadEvent：推送当前曲目和加载索引，供页面刷新元数据与歌词。
 * - Player.sendVolumeEvent：推送全局音量和静音状态。
 * - Player.sendPlaylistEvent：复制队列并剔除无法跨消息边界传递的 Howl 实例，再发送完整快照。
 * - threadPlayer：当前页面中的播放核心实例；文件名不表示创建了独立线程。
 */
/* eslint-disable no-underscore-dangle */
/* global playerSendMessage MediaService */
/* global Howl Howler */
{
  /**
   * 持有播放队列、Howler 实例和异步请求代次；创建时启动进度定时器，队列替换与清空时释放音频资源。
   */
  class Player {
    /**
     * 初始化空队列、播放代次、五分钟地址缓存和默认刷新计时器；实例保持至所属页面销毁。
     * 无参数。
     * @returns {Player} 由 new 创建并初始化的实例。
     */
    constructor() {
      this.playlist = [];
      this._random_playlist = [];
      this.index = -1;
      this._loop_mode = 0;
      // 播放地址解析成功后按曲目 ID 缓存在内存中，
      // 不写入持久化存储，因为平台地址会过期。
      this._media_uri_list = {};
      this.playedFrom = 0;
      this.mode =
        window.listen1Desktop ||
        !(
          (typeof chrome !== 'undefined' && chrome.runtime) ||
          (typeof browser !== 'undefined' && browser.runtime)
        )
          ? 'front'
          : 'background';
      this.skipTime = 15;
      this._generation = 0;
      this._pending = null;
      this._media_expiry = {};
      this._loadTimer = null;
      this._loadRetries = new Map();
      this.loudness = { enabled: false, mode: 'standard', status: 'off' };
      if (window.listen1Desktop && window.localStorage) {
        try {
          const saved = JSON.parse(
            window.localStorage.getItem('loudness-settings')
          );
          this.loudness.enabled = saved?.enabled === true;
          this.loudness.mode =
            saved?.mode === 'dynamic' ? 'dynamic' : 'standard';
          this.loudness.status = this.loudness.enabled ? 'idle' : 'off';
        } catch {
          /* Invalid optional settings keep the defaults. */
        }
      }
      this._analysis = null;
      this._normalizer = null;
      this._prepared = null;
      this._resumePosition = null;
    }

    /**
     * 推进播放代次，取消当前地址请求并清理加载超时，令迟到回调失效。
     * 无参数。
     * @returns {void} 无返回值。
     */
    cancelPending() {
      this._generation += 1;
      this._normalizer?.cancel();
      this._analysis = null;
      const pending = this._pending;
      this._pending = null;
      if (pending && pending.task) pending.task.cancel();
      clearTimeout(this._loadTimer);
    }

    get preparingPlayback() {
      return !!this._analysis?.playNow;
    }

    sendLoudnessEvent() {
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:LOUDNESS',
        data: { ...this.loudness },
      });
    }

    updateLoudness(status, extra = {}) {
      this.loudness = {
        enabled: this.loudness.enabled,
        mode: this.loudness.mode,
        status: this.loudness.enabled ? status : 'off',
        trackId: this.currentAudio?.id,
        ...extra,
      };
      this.sendLoudnessEvent();
    }

    setLoudness(settings) {
      if (!window.listen1Desktop) return;
      const enabled = settings.enabled === true;
      const mode = settings.mode === 'dynamic' ? 'dynamic' : 'standard';
      if (enabled === this.loudness.enabled && mode === this.loudness.mode)
        return;
      const playNow =
        this.playing || this.preparingPlayback || !!this._pending?.playNow;
      const materialized =
        !!this.currentHowl ||
        !!this._analysis ||
        this.loudness.status === 'error';
      if (this.currentHowl)
        this._resumePosition = { seconds: this.currentHowl.seek() };
      this.cancelPending();
      if (this.currentHowl) this.currentHowl.unload();
      if (this.currentAudio) this.currentAudio.howl = null;
      this._prepared = null;
      this.loudness.enabled = enabled;
      this.loudness.mode = mode;
      try {
        window.localStorage.setItem(
          'loudness-settings',
          JSON.stringify({ enabled, mode })
        );
      } catch {
        /* Playback remains usable when optional persistence is unavailable. */
      }
      this.updateLoudness('idle');
      if (this.currentAudio && (playNow || materialized)) {
        if (this._media_uri_list[this.currentAudio.id])
          this.finishLoad(this.index, playNow, !enabled);
        else this.retrieveMediaUrl(this.index, playNow);
      }
    }

    async prepareLoudness(index, playNow) {
      if (this._analysis) {
        this._analysis.playNow = playNow || this._analysis.playNow;
        return;
      }
      const track = this.currentAudio;
      const url = this._media_uri_list[track.id];
      const { mode } = this.loudness;
      this._prepared = null;
      if (track.howl) {
        this._resumePosition = { seconds: track.howl.seek() };
        track.howl.unload();
        track.howl = null;
      }
      this.cancelPending();
      const generation = this._generation;
      const task = { playNow };
      this._analysis = task;
      const isCurrent = () =>
        generation === this._generation &&
        track === this.currentAudio &&
        url === this._media_uri_list[track.id] &&
        this.loudness.enabled &&
        mode === this.loudness.mode;
      this.updateLoudness('analyzing');
      this.sendPlayingEvent('Analyzing');
      try {
        if (!this._normalizer)
          this._normalizer = new window.listen1NormalizedAudio.Normalizer();
        const prepared = await this._normalizer.prepare(
          track,
          url,
          mode,
          isCurrent,
          (phase) => {
            if (isCurrent()) this.updateLoudness('analyzing', { phase });
          }
        );
        if (!isCurrent()) return;
        this._normalizer.targets[mode] = prepared.targetDb;
        this._prepared = prepared;
        this._analysis = null;
        this.updateLoudness('active', {
          targetDb: prepared.targetDb,
          gainDb: prepared.gainDb,
          outputDb: prepared.outputDb,
          reductionDb: prepared.reductionDb,
        });
        this.finishLoad(this.index, task.playNow, true);
      } catch (error) {
        if (!isCurrent()) return;
        this._analysis = null;
        const reason = error.code || 'RESOURCE_LIMIT';
        if (window.listen1NormalizedAudio.skipped.has(reason)) {
          this.updateLoudness('skipped', { reason });
          this.finishLoad(this.index, task.playNow, true);
        } else {
          this.updateLoudness('error', { reason });
          this.sendPlayingEvent('AnalysisFailed');
        }
      }
    }

    /**
     * 切换播放器消息发送目标，后续事件按新模式路由。
     * @param newMode 新的播放环境或代理模式。
     * @returns {void} 无返回值。
     */
    setMode(newMode) {
      this.mode = newMode;
    }

    /**
     * 清理旧进度计时器，再按每秒刷新次数创建新计时器。
     * @param [rate] 每秒刷新次数；用于计算定时器间隔；默认值为 10。
     * @returns {void} 无返回值。
     */
    setRefreshRate(rate = 10) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = setInterval(
        /**
         * 在定时器或动画帧触发时，执行 this.sendFrameUpdate。
         * 无参数。
         * @returns {void} 无返回值。
         */
        () => {
          if (this.playing) {
            this.sendFrameUpdate();
          }
        },
        1000 / rate
      );
    }

    /**
     * 读取当前索引对应的曲目。
     * 无参数。
     * @returns {Object|undefined} 当前索引的曲目，空队列时为 undefined。
     */
    get currentAudio() {
      return this.playlist[this.index];
    }

    /**
     * 读取当前曲目的 Howl 实例；没有曲目时返回空值。
     * 无参数。
     * @returns {Howl|undefined} 当前曲目的 Howl 引用；尚未创建时为空值。
     */
    get currentHowl() {
      return this.currentAudio && this.currentAudio.howl;
    }

    /**
     * 查询当前音频是否正在播放，没有实例时返回 false。
     * 无参数。
     * @returns {boolean} 当前音频是否正在播放。
     */
    get playing() {
      return this.currentHowl ? this.currentHowl.playing() : false;
    }

    /**
     * 读取 Howler 的全局静音状态。
     * 无参数。
     * @returns {boolean} Howler 的全局静音状态。
     */
    // eslint-disable-next-line class-methods-use-this
    get muted() {
      return !!Howler._muted;
    }

    /**
     * 按 ID 去重后插入单首曲目，必要时移动当前索引并发送队列快照。
     * @param audio 待加入或操作的曲目对象；使用 id 字段。
     * @param idx 目标队列索引。
     * @returns {void} 无返回值。
     */
    insertAudio(audio, idx) {
      if (!audio || !audio.id) return;
      if (
        this.playlist.find(
          /**
           * 筛选检查 this.playlist 中的条目，audio.id 是否严格等于 i.id。
           * @param i 来自 this.playlist 的当前条目；使用 id 字段。
           * @returns {boolean} audio.id 是否严格等于 i.id。
           */
          (i) => audio.id === i.id
        )
      )
        return;

      const audioData = {
        ...audio,
        disabled: false, // 首次载入时避免阻塞初始化。
        howl: null,
      };
      if (typeof idx === 'number') {
        // 即使在队首插入也保持队列为一维数组。
        this.playlist.splice(idx, 0, audioData);
      } else {
        this.playlist.push(audioData);
      }
      this._random_playlist = [];
      if (typeof idx === 'number' && idx <= this.index) this.index += 1;
      this.sendPlaylistEvent();
      this.sendLoadEvent();
    }

    /**
     * 在同一数组内移动元素，目标超出长度时先补空位。
     * @param arr 待移动或格式化的数组；使用 push、splice 字段。
     * @param old_index 移动前的数组索引。
     * @param new_index 移动后的数组索引。
     * @returns {*} arr。
     */
    static array_move(arr, old_index, new_index) {
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
     * 将曲目放到目标曲目前后，重排后仍按 ID 保留当前播放曲目。
     * @param audio 待加入或操作的曲目对象；使用 id 字段。
     * @param to_audio 作为插入位置参照的目标曲目；使用 id 字段。
     * @param direction 插入或切换方向，使用调用方约定的前后标记。
     * @returns {void} 无返回值。
     */
    insertAudioByDirection(audio, to_audio, direction) {
      const originTrack = this.playlist[this.index];
      const index = this.playlist.findIndex(
        /**
         * 筛选检查 this.playlist 中的条目，i.id 是否严格等于 audio.id。
         * @param i 来自 this.playlist 的当前条目；使用 id 字段。
         * @returns {boolean} i.id 是否严格等于 audio.id。
         */
        (i) => i.id === audio.id
      );
      let insertIndex = this.playlist.findIndex(
        /**
         * 筛选检查 this.playlist 中的条目，i.id 是否严格等于 to_audio.id。
         * @param i 来自 this.playlist 的当前条目；使用 id 字段。
         * @returns {boolean} i.id 是否严格等于 to_audio.id。
         */
        (i) => i.id === to_audio.id
      );
      if (index < 0 || insertIndex < 0 || index === insertIndex) {
        return;
      }
      if (insertIndex > index) {
        insertIndex -= 1;
      }
      const offset = direction === 'top' ? 0 : 1;
      this.playlist = Player.array_move(
        this.playlist,
        index,
        insertIndex + offset
      );
      const foundOriginTrackIndex = this.playlist.findIndex(
        /**
         * 筛选检查 this.playlist 中的条目，originTrack 且 i.id 是否严格等于 originTrack.id。
         * @param i 来自 this.playlist 的当前条目；使用 id 字段。
         * @returns {*} originTrack 且 i.id 是否严格等于 originTrack.id。
         */
        (i) => originTrack && i.id === originTrack.id
      );
      if (foundOriginTrackIndex >= 0) {
        this.index = foundOriginTrackIndex;
      }
      this._random_playlist = [];

      this.sendPlaylistEvent();
      this.sendLoadEvent();
    }

    /**
     * 移除队列曲目并释放其音频和缓存；删除当前曲目时取消待处理操作并按原播放状态选择下一首。
     * @param idx 目标队列索引。
     * @returns {void} 无返回值。
     */
    removeAudio(idx) {
      if (!this.playlist[idx]) {
        return;
      }
      // 修改队列前保存当前播放状态。
      const isPlaying =
        this.playing || !!this._pending || this.preparingPlayback;
      const trackId = this.currentAudio && this.currentAudio.id;
      const removed = this.playlist[idx];
      if (removed.id === trackId) this.cancelPending();

      if (isPlaying && this.playlist[idx].id === trackId) {
        this.pause();
      }

      this.playlist.splice(idx, 1);
      if (removed.howl) removed.howl.unload();
      delete this._media_uri_list[removed.id];
      delete this._media_expiry[removed.id];
      this._loadRetries.delete(removed.id);
      this._random_playlist = [];
      const newIndex = this.playlist.findIndex(
        /**
         * 筛选检查 this.playlist 中的条目，i.id 是否严格等于 trackId。
         * @param i 来自 this.playlist 的当前条目；使用 id 字段。
         * @returns {boolean} i.id 是否严格等于 trackId。
         */
        (i) => i.id === trackId
      );
      if (newIndex >= 0) {
        this.index = newIndex;
      } else {
        // 被删除的是当前曲目。
        if (idx >= this.playlist.length) {
          this.index = this.playlist.length - 1;
        } else {
          this.index = idx;
        }
        if (isPlaying && this.playlist.length) {
          this.play();
        }
      }

      this.sendPlaylistEvent();
      this.sendLoadEvent();
      this.sendPlayingEvent('Removed');
    }

    /**
     * 过滤无效或重复 ID 后批量追加，只发送一次完整队列快照；空队列首次追加时加载首项。
     * @param list 待应用的曲目数组。
     * @returns {void} 无返回值。
     */
    appendAudioList(list) {
      if (!Array.isArray(list)) {
        return;
      }
      const ids = new Set(
        this.playlist.map(
          /**
           * 转换 this.playlist 中的条目，audio.id。
           * @param audio 来自 this.playlist 的当前条目；使用 id 字段。
           * @returns {*} audio.id。
           */
          (audio) => audio.id
        )
      );
      const additions = list.filter(
        /**
         * 筛选检查 list 中的条目，执行 ids.has。
         * @param audio 来自 list 的当前条目；使用 id 字段。
         * @returns {boolean} false；其他分支返回 true。
         */
        (audio) => {
          if (!audio || !audio.id || ids.has(audio.id)) return false;
          ids.add(audio.id);
          return true;
        }
      );
      if (!additions.length) return;
      this.playlist.push(
        ...additions.map(
          /**
           * 转换 additions 中的条目，包含 展开字段、disabled、howl 的对象。
           * @param audio 来自 additions 的当前条目。
           * @returns {Object} 包含 展开字段、disabled、howl 的对象。
           */
          (audio) => ({ ...audio, disabled: false, howl: null })
        )
      );
      this._random_playlist = [];
      this.sendPlaylistEvent();
      this.sendLoadEvent();
    }

    /**
     * 取消请求、卸载音频并清空队列与索引，按 notify 决定是否广播清空结果。
     * @param [notify] 是否发送队列变化事件；默认值为 true。
     * @returns {void} 无返回值。
     */
    clearPlaylist(notify = true) {
      this.cancelPending();
      this.unloadAll();
      this.playlist = [];
      this.index = -1;
      this._random_playlist = [];
      this._media_uri_list = {};
      this._media_expiry = {};
      this._loadRetries.clear();
      if (notify) {
        this.sendPlaylistEvent();
        this.sendLoadEvent();
        this.sendPlayingEvent('Cleared');
      }
    }

    /**
     * 停止队列中已有的所有 Howl 实例。
     * 无参数。
     * @returns {void} 无返回值。
     */
    stopAll() {
      if (this._pending || this._analysis) this.cancelPending();
      this._resumePosition = null;
      this.playlist.forEach(
        /**
         * 逐项处理 this.playlist 中的条目，执行 i.howl.stop。
         * @param i 来自 this.playlist 的当前条目；使用 howl 字段。
         * @returns {void} 无返回值。
         */
        (i) => {
          if (i.howl) {
            i.howl.stop();
          }
        }
      );
    }

    /**
     * 卸载 Howler 音频并清除曲目对原生实例的引用。
     * 无参数。
     * @returns {void} 无返回值。
     */
    unloadAll() {
      this._prepared = null;
      this._resumePosition = null;
      this._normalizer?.dropDecoded();
      this.updateLoudness('idle');
      this.playlist.forEach(
        /**
         * 逐项处理 this.playlist 中的条目，更新 track.howl，执行 track.howl.unload。
         * @param track 来自 this.playlist 的当前条目；使用 howl 字段。
         * @returns {void} 无返回值。
         */
        (track) => {
          if (track.howl) track.howl.unload();
          track.howl = null; // eslint-disable-line no-param-reassign -- 释放队列曲目关联的原生音频资源
        }
      );
    }

    /**
     * 清理旧队列、过滤无效及重复 ID 后替换列表，加载首项并广播新的完整快照。
     * @param list 待应用的曲目数组。
     * @returns {void} 无返回值。
     */
    setNewPlaylist(list) {
      if (!Array.isArray(list)) return;
      this.clearPlaylist(false);
      if (list.length) {
        const ids = new Set();
        this.playlist = list
          .filter(
            /**
             * 筛选检查 list 中的条目，执行 ids.has。
             * @param audio 来自 list 的当前条目；使用 id 字段。
             * @returns {boolean} false；其他分支返回 true。
             */
            (audio) => {
              if (!audio || !audio.id || ids.has(audio.id)) return false;
              ids.add(audio.id);
              return true;
            }
          )
          .map(
            /**
             * 转换 list.filter() 中的条目，包含 展开字段、howl 的对象。
             * @param audio 来自 list.filter() 的当前条目。
             * @returns {Object} 包含 展开字段、howl 的对象。
             */
            (audio) => ({
              ...audio,
              howl: null,
            })
          );
        // TODO：随机模式首次加载仍可改为随机选择曲目。
        this.index = this.playlist.length ? 0 : -1;
        this.load(0);
      }
      this.sendPlaylistEvent();
      if (!this.playlist.length) this.sendLoadEvent();
      this.sendPlayingEvent('QueueChanged');
    }

    /**
     * 查找曲目 ID，再按索引执行播放。
     * @param id 目标条目的唯一标识。
     * @returns {void} 无返回值。
     */
    playById(id) {
      const idx = this.playlist.findIndex(
        /**
         * 筛选检查 this.playlist 中的条目，audio.id 是否严格等于 id。
         * @param audio 来自 this.playlist 的当前条目；使用 id 字段。
         * @returns {boolean} audio.id 是否严格等于 id。
         */
        (audio) => audio.id === id
      );
      if (idx >= 0) this.play(idx);
    }

    /**
     * 查找曲目 ID，取消旧请求后加载该项但不自动播放。
     * @param id 目标条目的唯一标识。
     * @returns {void} 无返回值。
     */
    loadById(id) {
      const idx = this.playlist.findIndex(
        /**
         * 筛选检查 this.playlist 中的条目，audio.id 是否严格等于 id。
         * @param audio 来自 this.playlist 的当前条目；使用 id 字段。
         * @returns {boolean} audio.id 是否严格等于 id。
         */
        (audio) => audio.id === id
      );
      this.load(idx);
    }

    /**
     * 选择有效索引，检查地址缓存是否过期，再解析地址或使用已有地址播放。
     * @param {Number} idx 目标队列索引。
     * @returns {void} 无返回值。
     */
    play(idx) {
      if (!this.playlist.length) return;
      if (typeof idx === 'number' && !this.playlist[idx]) return;
      this.load(this.index < 0 && idx === undefined ? 0 : idx);

      const data = this.playlist[this.index];
      if (!data) return;
      if (this._media_expiry[data.id] < Date.now())
        delete this._media_uri_list[data.id];
      if (!this._media_uri_list[data.id]) {
        this.retrieveMediaUrl(this.index, true);
      } else {
        this.finishLoad(this.index, true);
      }
    }

    /**
     * 为当前曲目请求播放地址，共享同曲目的在途请求；用代次校验丢弃过期回调，失败后禁用曲目并尝试切歌。
     * @param index 当前条目的零起点索引。
     * @param playNow 加载成功后是否立即播放。
     * @returns {void} 无返回值。
     */
    retrieveMediaUrl(index, playNow) {
      const track = this.playlist[index];
      if (!track) return;
      if (this._pending && this._pending.id === track.id) return;
      this.cancelPending();
      const generation = this._generation;
      if (track.howl) {
        if (this.loudness.enabled)
          this._resumePosition = { seconds: track.howl.seek() };
        track.howl.unload();
        track.howl = null;
      }
      this._prepared = null;
      const pending = { id: track.id, task: null, playNow };
      this._pending = pending;
      /**
       * 检查播放代次和当前曲目是否仍与本次异步操作一致。
       * 无参数。
       * @returns {*} generation 是否严格等于 this._generation 且 this.currentAudio 是否严格等于 统一曲目对象 track。
       */
      const isCurrent = () =>
        generation === this._generation && this.currentAudio === track;
      // 地址可能来自原始平台，
      // 也可能来自 MediaService 选中的备用来源。
      const msg = {
        type: 'BG_PLAYER:RETRIEVE_URL',
        data: {
          ...this.playlist[index],
          howl: undefined,
          index,
          playNow,
        },
      };

      pending.task = MediaService.bootstrapTrack(
        msg.data,
        /**
         * 进入此回调后，更新 this._pending、msg.type、msg.data、track.bitrate，执行 isCurrent。
         * @param bootinfo 解析播放地址时返回的平台和码率信息；使用 bitrate、platform 字段。
         * @returns {void} 无返回值。
         */
        (bootinfo) => {
          if (!isCurrent()) return;
          this._pending = null;
          msg.type = 'BG_PLAYER:RETRIEVE_URL_SUCCESS';

          msg.data = { ...msg.data, ...bootinfo };

          track.bitrate = bootinfo.bitrate;
          track.platform = bootinfo.platform;
          msg.data.index = this.index;

          this.setMediaURI(msg.data.url, msg.data.id);
          this.setAudioDisabled(false, msg.data.index);
          this.finishLoad(msg.data.index, playNow);
          playerSendMessage(this.mode, msg);
        },
        /**
         * 进入此回调后，更新 this._pending、msg.type、msg.data.error、msg.data.index，执行 isCurrent。
         * @param error 被捕获或传入的异常。
         * @returns {void} 无返回值。
         */
        (error) => {
          if (!isCurrent()) return;
          this._pending = null;
          msg.type = 'BG_PLAYER:RETRIEVE_URL_FAIL';
          msg.data.error = error;
          msg.data.index = this.index;

          this.setAudioDisabled(true, msg.data.index);
          playerSendMessage(this.mode, msg);

          this.skip('next');
        }
      );
    }

    /**
     * 切换当前曲目并停止其他音频，广播加载事件，防止多首同时播放。
     * @param {Number} idx 目标队列索引。
     * @returns {void} 无返回值。
     */
    load(idx) {
      if (!this.playlist.length) return;
      let index = typeof idx === 'number' ? idx : this.index;
      if (index < 0) return;
      if (!this.playlist[index]) {
        index = 0;
      }
      // 加载新曲目前停止旧音频，避免同时播放。
      if (index !== this.index) {
        this.cancelPending();
        this.unloadAll();
      }
      this.index = index;

      this.sendLoadEvent();
    }

    /**
     * 创建或复用 HTML5 Howl，绑定受播放代次保护的事件；加载失败最多重新解析一次地址，并设置播放超时。
     * @param index 当前条目的零起点索引。
     * @param playNow 加载成功后是否立即播放。
     * @returns {void} 无返回值。
     */
    finishLoad(index, playNow, ready = false) {
      const data = this.playlist[index];
      if (!data || data !== this.currentAudio) return;
      if (
        this.loudness.enabled &&
        !ready &&
        (!data.howl?.normalized ||
          this._prepared?.source !== this._media_uri_list[data.id] ||
          this._prepared?.targetDb !==
            this._normalizer?.targets[this.loudness.mode])
      ) {
        this.prepareLoudness(index, playNow);
        return;
      }

      // 已有对应 Howl 时复用，
      // 否则创建新的音频实例。
      const self = this;
      const generation = this._generation;
      /**
       * 检查播放代次和当前曲目是否仍与本次异步操作一致。
       * 无参数。
       * @returns {*} generation 是否严格等于 self._generation 且 self.currentAudio 是否严格等于 data。
       */
      const isCurrent = () =>
        generation === self._generation && self.currentAudio === data;
      /**
       * 使当前地址缓存失效并清理超时；首次失败重试地址解析，再失败则禁用曲目并跳过。
       * @param err 异步操作的错误；成功回调通常为 null。
       * @returns {void} 无返回值。
       */
      const failLoad = (err) => {
        if (!isCurrent()) return;
        if (self.loudness.enabled) {
          clearTimeout(self._loadTimer);
          if (self.loudness.status !== 'skipped')
            self.updateLoudness('error', { reason: 'PLAYBACK_ERROR' });
          self.sendPlayingEvent('Error');
          return;
        }
        clearTimeout(self._loadTimer);
        if (data.howl) data.howl.unload();
        data.howl = null;
        delete self._media_uri_list[data.id];
        const attempts = self._loadRetries.get(data.id) || 0;
        if (attempts < 1) {
          self._loadRetries.set(data.id, attempts + 1);
          self.retrieveMediaUrl(self.index, playNow);
          return;
        }
        data.disabled = true;
        playerSendMessage(self.mode, {
          type: 'BG_PLAYER:PLAY_FAILED',
          data: { code: 'MEDIA_ERROR', trackId: data.id, detail: err },
        });
        self.sendPlayingEvent('Error');
        self.skip('next');
      };
      if (!data.howl) {
        const options = {
          src: [self._media_uri_list[data.id]],
          format: 'mp3', // 明确格式以绕过 Howl 对 URL 扩展名的检查，参见问题 #1200。
          volume: 1,
          mute: self.muted,
          html5: true, // 使用 HTML5 音频进行流式加载，避免整首音频先进入缓冲。
          /**
           * 确认回调未过期后清理超时，记录播放开始时间并更新媒体会话元数据和播放状态。
           * 无参数。
           * @returns {void} 无返回值。
           */
          onplay() {
            if (!isCurrent()) return;
            clearTimeout(self._loadTimer);
            if ('mediaSession' in navigator) {
              const { mediaSession } = navigator;
              mediaSession.playbackState = 'playing';
              mediaSession.metadata = new MediaMetadata({
                title: self.currentAudio.title,
                artist: self.currentAudio.artist,
                album: `Listen 1  •  ${(
                  self.currentAudio.album || '<???>'
                ).padEnd(100)}`,
                artwork: self.currentAudio.img_url
                  ? [
                      {
                        src: self.currentAudio.img_url,
                        sizes: '500x500',
                      },
                    ]
                  : [],
              });
            }
            self.currentAudio.disabled = false;
            // 把 Date.now() 的毫秒时间戳换算为收听记录所需的秒。
            self.playedFrom = Math.round(Date.now() / 1000);
            self.sendPlayingEvent('Playing');
          },
          /**
           * 仅对当前曲目更新加载状态，忽略已被切换的音频实例。
           * 无参数。
           * @returns {void} 无返回值。
           */
          onload() {
            if (!isCurrent()) return;
            if (self._resumePosition) {
              const position = self._resumePosition;
              self._resumePosition = null;
              self.currentHowl.seek(
                position.seconds ??
                  self.currentHowl.duration() * position.fraction
              );
            }
            self.currentAudio.disabled = false;
            self.sendPlayingEvent('Loaded');
          },
          /**
           * 根据当前循环模式重复、随机或顺序切换，并同步播放结束状态。
           * 无参数。
           * @returns {void} 无返回值。
           */
          onend() {
            if (!isCurrent()) return;
            switch (self.loop_mode) {
              case 2:
                self.skip('random');
                break;

              case 1:
                self.play();
                break;

              case 0:
              default:
                self.skip('next');
                break;
            }
            self.sendPlayingEvent('Ended');
          },
          /**
           * 在音频暂停后同步有效实例的播放状态。
           * 无参数。
           * @returns {void} 无返回值。
           */
          onpause() {
            if (!isCurrent()) return;
            if (navigator.mediaSession)
              navigator.mediaSession.playbackState = 'paused';
            self.sendPlayingEvent('Paused');
          },
          /**
           * 在音频停止后同步有效实例的播放状态。
           * 无参数。
           * @returns {void} 无返回值。
           */
          onstop() {
            if (!isCurrent()) return;
            self.sendPlayingEvent('Stopped');
          },
          /**
           * 在有效实例完成跳转后推送进度。
           * 无参数。
           * @returns {void} 无返回值。
           */
          onseek() {},
          /**
           * 在有效实例音量变化后推送音量状态。
           * 无参数。
           * @returns {void} 无返回值。
           */
          onvolume() {},
          /**
           * 把加载错误交给当前曲目的重试与失败处理。
           * @param id 目标条目的唯一标识；当前函数体未使用，保留调用签名。
           * @param err 异步操作的错误；成功回调通常为 null。
           * @returns {void} 无返回值。
           */
          onloaderror(id, err) {
            failLoad(err);
          },
          /**
           * 把播放错误交给当前曲目的重试与失败处理。
           * @param id 目标条目的唯一标识；当前函数体未使用，保留调用签名。
           * @param err 异步操作的错误；成功回调通常为 null。
           * @returns {void} 无返回值。
           */
          onplayerror(id, err) {
            failLoad(err);
          },
        };
        data.howl = this._prepared
          ? new window.listen1NormalizedAudio.BufferAudio(
              options,
              this._prepared,
              this._normalizer.context,
              this.volume,
              this.muted
            )
          : new Howl(options);
        if (data.howl.normalized && this._resumePosition) {
          const position = this._resumePosition;
          this._resumePosition = null;
          data.howl.seek(
            position.seconds ?? data.howl.duration() * position.fraction
          );
        }
      }

      if (playNow) {
        if (this.playing && index === this.index) {
          return;
        }
        this.playlist.forEach(
          /**
           * 逐项处理 this.playlist 中的条目，执行 i.howl.stop。
           * @param i 来自 this.playlist 的当前条目；使用 howl 字段。
           * @returns {void} 无返回值。
           */
          (i) => {
            if (i.howl && i.howl !== this.currentHowl) {
              i.howl.stop();
            }
          }
        );
        this.currentHowl.play();
        clearTimeout(this._loadTimer);
        this._loadTimer = setTimeout(
          /**
           * 在定时器或动画帧触发时，执行 failLoad（"LOAD_TIMEOUT"）。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            if (!this.playing) failLoad('LOAD_TIMEOUT');
          },
          15000
        );
      }
    }

    /**
     * 暂停当前音频并推送暂停状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    pause() {
      if (this._analysis) {
        this._analysis.playNow = false;
        this.sendPlayingEvent('Paused');
        return;
      }
      if (this._pending) this.cancelPending();
      clearTimeout(this._loadTimer);
      if (!this.currentHowl) return;

      // 暂停音频。
      this.currentHowl.pause();
    }

    /**
     * 按顺序或随机映射选择前后曲目，跳过禁用项；整队都不可用时发送失败事件。
     * @param {String} direction 插入或切换方向，使用调用方约定的前后标记。
     * @returns {void} 无返回值。
     */
    skip(direction) {
      this.cancelPending();
      if (!this.playlist.length) {
        this.index = -1;
        return;
      }
      this.unloadAll();
      // 根据方向计算下一候选曲目。
      /**
       * 根据方向和循环模式计算下一候选索引，保持索引落在队列范围内。
       * @param idx 目标队列索引。
       * @returns {*} 整理后的结果 result。
       */
      const nextIndexFn = (idx) => {
        const l = this.playlist.length;
        const random_mode = this._loop_mode === 2 || direction === 'random';

        let rdx = idx;

        if (random_mode) {
          if (this._random_playlist.length / 2 !== l) {
            // 构造随机队列顺序及逆向索引。
            const a = Array.from(
              { length: l },
              /**
               * 进入此回调后，取得 i。
               * @param _v 数组或类数组输入中的当前值；当前函数体未使用，保留调用签名。
               * @param i 当前条目的零起点索引。
               * @returns {*} i。
               */
              (_v, i) => i
            );
            for (let i = 0; i < l; i += 1) {
              const e = l - i - 1;
              const s = Math.floor(Math.random() * (e + 1));
              const t = a[s];
              a[s] = a[e];
              a[e] = t;
            }
            for (let i = 0; i < l; i += 1) a[a[i] + l] = i;
            this._random_playlist = a;
          }
          rdx = this._random_playlist[idx + l] ?? -1;
        } else if (this._random_playlist.length !== 0) {
          // 清除旧的随机队列映射。
          this._random_playlist = [];
        }

        if (direction === 'prev') {
          if (rdx === 0) rdx = l;
          rdx -= 1;
        } else {
          rdx += 1;
        }
        const result = random_mode ? this._random_playlist[rdx % l] : rdx % l;

        return result;
      };
      this.index = nextIndexFn(this.index);

      let tryCount = 0;
      while (tryCount < this.playlist.length) {
        if (!this.playlist[this.index].disabled) {
          this.play(this.index);
          return;
        }
        this.index = nextIndexFn(this.index);
        tryCount += 1;
      }
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:RETRIEVE_URL_FAIL_ALL',
      });
      this.sendPlayingEvent('Unavailable');
      this.sendLoadEvent();
    }

    /**
     * 接受 all、one、shuffle 名称或对应的 0、1、2 编号更新循环模式；其他输入保持原状态。
     * @param input 待校验或转换的输入值。
     * @returns {void} 无返回值；赋值操作更新相应播放器状态。
     */
    set loop_mode(input) {
      const LOOP_MODE = {
        all: 0,
        one: 1,
        shuffle: 2,
      };
      let myMode;
      if (typeof input === 'string') {
        myMode = LOOP_MODE[input];
      } else {
        myMode = input;
      }
      if (!Object.values(LOOP_MODE).includes(myMode)) {
        return;
      }
      this._loop_mode = myMode;
    }

    /**
     * 读取当前播放循环模式，不修改队列或播放位置。
     * 无参数。
     * @returns {number} 当前循环模式编号：0 为列表循环，1 为单曲循环，2 为随机。
     */
    get loop_mode() {
      return this._loop_mode;
    }

    /**
     * 把数值交给 Howler 设置全局音量，并发送音量及播放帧事件；非数值输入保持原状态，数值范围由 Howler 处理。
     * @param {Number} val 待设置的 0 至 1 音量比例。
     * @returns {void} 无返回值；赋值操作更新相应播放器状态。
     */
    set volume(val) {
      // 更新影响所有 Howl 实例的全局音量。
      if (typeof val === 'number') {
        Howler.volume(val);
        this.currentHowl?.setMaster?.(this.volume, this.muted);
        window.listen1NormalizedAudio?.syncMaster?.(this.volume, this.muted);
        this.sendVolumeEvent();
        this.sendFrameUpdate();
      }
    }

    /**
     * 读取 Howler 的全局音量，供页面状态同步与音量调整使用。
     * 无参数。
     * @returns {number} Howler 全局音量，范围为 0 至 1。
     */
    // eslint-disable-next-line class-methods-use-this
    get volume() {
      return Howler.volume();
    }

    /**
     * 按 0.1 的步长增减音量，并限制在 0 至 1。
     * @param inc 是否增加音量；否则降低。
     * @returns {void} 无返回值。
     */
    adjustVolume(inc) {
      this.volume = inc
        ? Math.min(this.volume + 0.1, 1)
        : Math.max(this.volume - 0.1, 0);
      this.sendVolumeEvent();
      this.sendFrameUpdate();
    }

    /**
     * 开启全局静音并通知音量状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    mute() {
      Howler.mute(true);
      this.currentHowl?.setMaster?.(this.volume, true);
      window.listen1NormalizedAudio?.syncMaster?.(this.volume, true);
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:MUTE',
        data: true,
      });
    }

    /**
     * 关闭全局静音并通知音量状态。
     * 无参数。
     * @returns {void} 无返回值。
     */
    unmute() {
      Howler.mute(false);
      this.currentHowl?.setMaster?.(this.volume, false);
      window.listen1NormalizedAudio?.syncMaster?.(this.volume, false);
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:MUTE',
        data: false,
      });
    }

    /**
     * 将 0 至 1 的播放比例换算为秒并跳转，随后推送进度。
     * @param {Number} per 0 至 1 的比例，页面音量门面另使用 0 至 100。
     * @returns {void} 无返回值。
     */
    seek(per) {
      if (this._analysis) {
        this._resumePosition = { fraction: Math.max(0, Math.min(1, per)) };
        return;
      }
      if (!this.currentHowl) return;

      // 取得当前待操作的 Howl 实例。
      const audio = this.currentHowl;

      // 将比例转换为秒数位置。
      // 停用代码，保留供历史对照：
      // if (audio.playing()) {
      // }
      audio.seek(audio.duration() * per);
    }

    /**
     * 以秒为单位跳转当前音频，并推送新进度。
     * @param {Number} seconds 以秒为单位的播放位置。
     * @returns {void} 无返回值。
     */
    seekTime(seconds) {
      if (this._analysis) {
        this._resumePosition = { seconds: Math.max(0, seconds) };
        return;
      }
      if (!this.currentHowl) return;
      const audio = this.currentHowl;
      audio.seek(seconds);
    }

    /**
     * 将秒数向下取整并格式化为分钟与两位秒数。
     * @param {Number} secs 待格式化的秒数。
     * @returns {String} 以分钟和两位秒数表示的时间。
     */
    static formatTime(secs) {
      const minutes = Math.floor(secs / 60) || 0;
      const seconds = secs - minutes * 60 || 0;

      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }

    /**
     * 按曲目 ID 缓存播放 URL，并写入五分钟后的过期时间；第二个形参 url 实际作为曲目 ID 使用。
     * @param uri 实际的媒体播放 URL。
     * @param url 作为缓存键的曲目 ID，虽然形参名为 url，但这里不是媒体地址。
     * @returns {void} 无返回值。
     */
    setMediaURI(uri, url) {
      if (url) {
        const changed =
          this.loudness.enabled &&
          this.currentAudio?.id === url &&
          this._media_uri_list[url] &&
          this._media_uri_list[url] !== uri;
        const playNow = this.playing || this.preparingPlayback;
        const materialized = !!this.currentHowl || !!this._analysis;
        if (changed) {
          if (this.currentHowl)
            this._resumePosition = { seconds: this.currentHowl.seek() };
          this.cancelPending();
          if (this.currentHowl) this.currentHowl.unload();
          this.currentAudio.howl = null;
          this._prepared = null;
        }
        this._media_uri_list[url] = uri;
        this._media_expiry[url] = Date.now() + 5 * 60 * 1000;
        if (changed && materialized) this.finishLoad(this.index, playNow);
      }
    }

    /**
     * 修改指定队列项的禁用标记。
     * @param disabled 是否标记曲目为不可用。
     * @param idx 目标队列索引。
     * @returns {void} 无返回值。
     */
    setAudioDisabled(disabled, idx) {
      if (this.playlist[idx]) {
        this.playlist[idx].disabled = disabled;
      }
    }

    /**
     * 向页面推送当前秒数、时长和进度比例，并更新媒体会话位置。
     * 无参数。
     * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
     */
    async sendFrameUpdate() {
      const data = {
        id: this.currentAudio ? this.currentAudio.id : 0,
        duration: this.currentHowl ? this.currentHowl.duration() : 0,
        pos: this.currentHowl ? this.currentHowl.seek() : 0,
        playedFrom: this.playedFrom,
        playing: this.playing,
      };
      if (
        navigator.mediaSession &&
        'setPositionState' in navigator.mediaSession &&
        Number.isFinite(data.duration) &&
        data.duration > 0
      ) {
        navigator.mediaSession.setPositionState({
          duration: this.currentHowl ? this.currentHowl.duration() : 0,
          playbackRate: this.currentHowl ? this.currentHowl.rate() : 1,
          position: Math.max(0, Math.min(Number(data.pos) || 0, data.duration)),
        });
      }

      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:FRAME_UPDATE',
        data,
      });
    }

    /**
     * 推送播放状态及触发原因。
     * @param [reason] 播放状态事件的原因标记；默认值为 "UNKNOWN"。
     * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
     */
    async sendPlayingEvent(reason = 'UNKNOWN') {
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:PLAY_STATE',
        data: {
          isPlaying: this.playing,
          reason,
        },
      });
    }

    /**
     * 推送当前曲目和加载索引，供页面刷新元数据与歌词。
     * 无参数。
     * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
     */
    async sendLoadEvent() {
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:LOAD',
        data: {
          currentPlaying: {
            ...this.currentAudio,
            howl: undefined,
          },
          playlist: {
            index: this.index,
            length: this.playlist.length,
          },
        },
      });
    }

    /**
     * 推送全局音量和静音状态。
     * 无参数。
     * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
     */
    async sendVolumeEvent() {
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:VOLUME',
        data: this.volume * 100,
      });
    }

    /**
     * 复制队列并剔除无法跨消息边界传递的 Howl 实例，再发送完整快照。
     * 无参数。
     * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
     */
    async sendPlaylistEvent() {
      // Howl 实例无法直接复制或跨页面传递，
      // 因此每次队列事件都去掉实例引用。
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:PLAYLIST',
        data: this.playlist.map(
          /**
           * 转换 this.playlist 中的条目，包含 展开字段、howl 的对象。
           * @param audio 来自 this.playlist 的当前条目。
           * @returns {Object} 包含 展开字段、howl 的对象。
           */
          (audio) => ({ ...audio, howl: undefined })
        ),
      });
    }
  }

  // 创建初始为空的播放器并暴露给页面桥。

  /**
   * threadPlayer：当前页面中的播放核心实例；文件名不表示创建了独立线程；类型为 Player。
   * @type {Player}
   */
  const threadPlayer = new Player();
  threadPlayer.setRefreshRate();
  window.threadPlayer = threadPlayer;

  if ('mediaSession' in navigator) {
    const { mediaSession } = navigator;
    mediaSession.setActionHandler(
      'play',
      /**
       * 响应 "play" 事件，执行 threadPlayer.play。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        threadPlayer.play();
      }
    );
    mediaSession.setActionHandler(
      'pause',
      /**
       * 响应 "pause" 事件，执行 threadPlayer.pause。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        threadPlayer.pause();
      }
    );
    mediaSession.setActionHandler(
      'seekforward',
      /**
       * 响应 "seekforward" 事件，执行 threadPlayer.sendFrameUpdate。
       * @param details Electron 提供的请求详情，含 URL 和请求头；使用 seekOffset 字段。
       * @returns {void} 无返回值。
       */
      (details) => {
        // 处理系统媒体通知中的快进操作。
        const { currentHowl } = threadPlayer;
        if (!currentHowl) return;
        const skipTime = details.seekOffset || threadPlayer.skipTime;
        const newTime = Math.min(
          currentHowl.seek() + skipTime,
          currentHowl.duration()
        );
        threadPlayer.seekTime(newTime);
        threadPlayer.sendFrameUpdate();
      }
    );
    mediaSession.setActionHandler(
      'seekbackward',
      /**
       * 响应 "seekbackward" 事件，执行 threadPlayer.sendFrameUpdate。
       * @param details Electron 提供的请求详情，含 URL 和请求头；使用 seekOffset 字段。
       * @returns {void} 无返回值。
       */
      (details) => {
        // 处理系统媒体通知中的快退操作。
        const { currentHowl } = threadPlayer;
        if (!currentHowl) return;
        const skipTime = details.seekOffset || threadPlayer.skipTime;
        const newTime = Math.max(currentHowl.seek() - skipTime, 0);
        threadPlayer.seekTime(newTime);
        threadPlayer.sendFrameUpdate();
      }
    );
    mediaSession.setActionHandler(
      'seekto',
      /**
       * 响应 "seekto" 事件，执行 threadPlayer.sendFrameUpdate。
       * @param details Electron 提供的请求详情，含 URL 和请求头。
       * @returns {void} 无返回值。
       */
      (details) => {
        const { seekTime } = details;
        threadPlayer.seekTime(seekTime);
        threadPlayer.sendFrameUpdate();
      }
    );
    mediaSession.setActionHandler(
      'nexttrack',
      /**
       * 响应 "nexttrack" 事件，执行 threadPlayer.sendFrameUpdate。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        threadPlayer.skip('next');
        threadPlayer.sendFrameUpdate();
      }
    );
    mediaSession.setActionHandler(
      'previoustrack',
      /**
       * 响应 "previoustrack" 事件，执行 threadPlayer.sendFrameUpdate。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        threadPlayer.skip('prev');
        threadPlayer.sendFrameUpdate();
      }
    );
  }
  playerSendMessage(threadPlayer.mode, {
    type: 'BG_PLAYER:READY',
  });
}
