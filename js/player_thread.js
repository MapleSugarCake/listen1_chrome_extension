/* eslint-disable no-underscore-dangle */
/* global playerSendMessage MediaService */
/* global Howl Howler */
{
  /**
   * Player class containing the state of our playlist and where we are in it.
   * Includes all methods for playing, skipping, updating the display, etc.
   * @param {Array} playlist Array of objects with playlist song details ({title, file, howl}).
   */
  class Player {
    constructor() {
      this.playlist = [];
      this._random_playlist = [];
      this.index = -1;
      this._loop_mode = 0;
      // Media URLs are cached by Listen1 track id after provider bootstrap.
      // They are intentionally not persisted because provider URLs can expire.
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
    }

    cancelPending() {
      this._generation += 1;
      const pending = this._pending;
      this._pending = null;
      if (pending && pending.task) pending.task.cancel();
      clearTimeout(this._loadTimer);
    }

    setMode(newMode) {
      this.mode = newMode;
    }

    setRefreshRate(rate = 10) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = setInterval(() => {
        if (this.playing) {
          this.sendFrameUpdate();
        }
      }, 1000 / rate);
    }

    get currentAudio() {
      return this.playlist[this.index];
    }

    get currentHowl() {
      return this.currentAudio && this.currentAudio.howl;
    }

    get playing() {
      return this.currentHowl ? this.currentHowl.playing() : false;
    }

    // eslint-disable-next-line class-methods-use-this
    get muted() {
      return !!Howler._muted;
    }

    insertAudio(audio, idx) {
      if (!audio || !audio.id) return;
      if (this.playlist.find((i) => audio.id === i.id)) return;

      const audioData = {
        ...audio,
        disabled: false, // avoid first time load block
        howl: null,
      };
      if (typeof idx === 'number') {
        // Keep the queue flat even when inserting at the head of the list.
        this.playlist.splice(idx, 0, audioData);
      } else {
        this.playlist.push(audioData);
      }
      this._random_playlist = [];
      if (typeof idx === 'number' && idx <= this.index) this.index += 1;
      this.sendPlaylistEvent();
      this.sendLoadEvent();
    }

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
      return arr; // for testing
    }

    insertAudioByDirection(audio, to_audio, direction) {
      const originTrack = this.playlist[this.index];
      const index = this.playlist.findIndex((i) => i.id === audio.id);
      let insertIndex = this.playlist.findIndex((i) => i.id === to_audio.id);
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
        (i) => originTrack && i.id === originTrack.id
      );
      if (foundOriginTrackIndex >= 0) {
        this.index = foundOriginTrackIndex;
      }
      this._random_playlist = [];

      this.sendPlaylistEvent();
      this.sendLoadEvent();
    }

    removeAudio(idx) {
      if (!this.playlist[idx]) {
        return;
      }
      // restore playing status before change
      const isPlaying = this.playing || !!this._pending;
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
      const newIndex = this.playlist.findIndex((i) => i.id === trackId);
      if (newIndex >= 0) {
        this.index = newIndex;
      } else {
        // current playing is deleted
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

    appendAudioList(list) {
      if (!Array.isArray(list)) {
        return;
      }
      const ids = new Set(this.playlist.map((audio) => audio.id));
      const additions = list.filter((audio) => {
        if (!audio || !audio.id || ids.has(audio.id)) return false;
        ids.add(audio.id);
        return true;
      });
      if (!additions.length) return;
      this.playlist.push(
        ...additions.map((audio) => ({ ...audio, disabled: false, howl: null }))
      );
      this._random_playlist = [];
      this.sendPlaylistEvent();
      this.sendLoadEvent();
    }

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

    stopAll() {
      this.playlist.forEach((i) => {
        if (i.howl) {
          i.howl.stop();
        }
      });
    }

    unloadAll() {
      this.playlist.forEach((track) => {
        if (track.howl) track.howl.unload();
        track.howl = null; // eslint-disable-line no-param-reassign -- release the queued track's native audio resource
      });
    }

    setNewPlaylist(list) {
      if (!Array.isArray(list)) return;
      this.clearPlaylist(false);
      if (list.length) {
        const ids = new Set();
        this.playlist = list
          .filter((audio) => {
            if (!audio || !audio.id || ids.has(audio.id)) return false;
            ids.add(audio.id);
            return true;
          })
          .map((audio) => ({
            ...audio,
            howl: null,
          }));
        // TODO: random mode need random choose first song to load
        this.index = this.playlist.length ? 0 : -1;
        this.load(0);
      }
      this.sendPlaylistEvent();
      if (!this.playlist.length) this.sendLoadEvent();
      this.sendPlayingEvent('QueueChanged');
    }

    playById(id) {
      const idx = this.playlist.findIndex((audio) => audio.id === id);
      if (idx >= 0) this.play(idx);
    }

    loadById(id) {
      const idx = this.playlist.findIndex((audio) => audio.id === id);
      this.load(idx);
    }

    /**
     * Play a song in the playlist.
     * @param  {Number} index Index of the song in the playlist
     * (leave empty to play the first or current).
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

    retrieveMediaUrl(index, playNow) {
      const track = this.playlist[index];
      if (!track) return;
      if (this._pending && this._pending.id === track.id) return;
      this.cancelPending();
      const generation = this._generation;
      if (track.howl) {
        track.howl.unload();
        track.howl = null;
      }
      const pending = { id: track.id, task: null };
      this._pending = pending;
      const isCurrent = () =>
        generation === this._generation && this.currentAudio === track;
      // Providers may return a direct URL from the original source or from a
      // mirror provider selected by MediaService.bootstrapTrack.
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
     * Load a song from the playlist.
     * @param  {Number} index Index of the song in the playlist
     * (leave empty to load the first or current).
     */
    load(idx) {
      if (!this.playlist.length) return;
      let index = typeof idx === 'number' ? idx : this.index;
      if (index < 0) return;
      if (!this.playlist[index]) {
        index = 0;
      }
      // stop when load new track to avoid multiple songs play in same time
      if (index !== this.index) {
        this.cancelPending();
        this.unloadAll();
      }
      this.index = index;

      this.sendLoadEvent();
    }

    finishLoad(index, playNow) {
      const data = this.playlist[index];
      if (!data || data !== this.currentAudio) return;

      // If we already loaded this track, use the current one.
      // Otherwise, setup and load a new Howl.
      const self = this;
      const generation = this._generation;
      const isCurrent = () =>
        generation === self._generation && self.currentAudio === data;
      const failLoad = (err) => {
        if (!isCurrent()) return;
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
        data.howl = new Howl({
          src: [self._media_uri_list[data.id]],
          format: 'mp3', // bypass Howl checking url extension, issue #1200
          volume: 1,
          mute: self.muted,
          html5: true, // Force to HTML5 so that the audio can stream in (best for large files).
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
                artwork: [
                  {
                    src: self.currentAudio.img_url,
                    sizes: '500x500',
                  },
                ],
              });
            }
            self.currentAudio.disabled = false;
            // Date.now() returns a millisecond timestamp that needs to be converted to a second timestamp
            self.playedFrom = Math.round(Date.now() / 1000);
            self.sendPlayingEvent('Playing');
          },
          onload() {
            if (!isCurrent()) return;
            self.currentAudio.disabled = false;
            self.sendPlayingEvent('Loaded');
          },
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
          onpause() {
            if (!isCurrent()) return;
            if (navigator.mediaSession)
              navigator.mediaSession.playbackState = 'paused';
            self.sendPlayingEvent('Paused');
          },
          onstop() {
            if (!isCurrent()) return;
            self.sendPlayingEvent('Stopped');
          },
          onseek() {},
          onvolume() {},
          onloaderror(id, err) {
            failLoad(err);
          },
          onplayerror(id, err) {
            failLoad(err);
          },
        });
      }

      if (playNow) {
        if (this.playing && index === this.index) {
          return;
        }
        this.playlist.forEach((i) => {
          if (i.howl && i.howl !== this.currentHowl) {
            i.howl.stop();
          }
        });
        this.currentHowl.play();
        clearTimeout(this._loadTimer);
        this._loadTimer = setTimeout(() => {
          if (!this.playing) failLoad('LOAD_TIMEOUT');
        }, 15000);
      }
    }

    /**
     * Pause the currently playing track.
     */
    pause() {
      if (this._pending) this.cancelPending();
      clearTimeout(this._loadTimer);
      if (!this.currentHowl) return;

      // Puase the sound.
      this.currentHowl.pause();
    }

    /**
     * Skip to the next or previous track.
     * @param  {String} direction 'next' or 'prev'.
     */
    skip(direction) {
      this.cancelPending();
      if (!this.playlist.length) {
        this.index = -1;
        return;
      }
      this.unloadAll();
      // Get the next track based on the direction of the track.
      const nextIndexFn = (idx) => {
        const l = this.playlist.length;
        const random_mode = this._loop_mode === 2 || direction === 'random';

        let rdx = idx;

        if (random_mode) {
          if (this._random_playlist.length / 2 !== l) {
            // construction random playlist
            const a = Array.from({ length: l }, (_v, i) => i);
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
          // clear random playlist
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

    get loop_mode() {
      return this._loop_mode;
    }

    /**
     * Set the volume and update the volume slider display.
     * @param  {Number} val Volume between 0 and 1.
     */
    set volume(val) {
      // Update the global volume (affecting all Howls).
      if (typeof val === 'number') {
        Howler.volume(val);
        this.sendVolumeEvent();
        this.sendFrameUpdate();
      }
    }

    // eslint-disable-next-line class-methods-use-this
    get volume() {
      return Howler.volume();
    }

    adjustVolume(inc) {
      this.volume = inc
        ? Math.min(this.volume + 0.1, 1)
        : Math.max(this.volume - 0.1, 0);
      this.sendVolumeEvent();
      this.sendFrameUpdate();
    }

    mute() {
      Howler.mute(true);
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:MUTE',
        data: true,
      });
    }

    unmute() {
      Howler.mute(false);
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:MUTE',
        data: false,
      });
    }

    /**
     * Seek to a new position in the currently playing track.
     * @param  {Number} per Percentage through the song to skip.
     */
    seek(per) {
      if (!this.currentHowl) return;

      // Get the Howl we want to manipulate.
      const audio = this.currentHowl;

      // Convert the percent into a seek position.
      // if (audio.playing()) {
      // }
      audio.seek(audio.duration() * per);
    }
    /**
     * Seek to a new position in the currently playing track.
     * @param {Number} seconds Seconds through the song to skip.
     */

    seekTime(seconds) {
      if (!this.currentHowl) return;
      const audio = this.currentHowl;
      audio.seek(seconds);
    }

    /**
     * Format the time from seconds to M:SS.
     * @param  {Number} secs Seconds to format.
     * @return {String}      Formatted time.
     */
    static formatTime(secs) {
      const minutes = Math.floor(secs / 60) || 0;
      const seconds = secs - minutes * 60 || 0;

      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    }

    setMediaURI(uri, url) {
      if (url) {
        this._media_uri_list[url] = uri;
        this._media_expiry[url] = Date.now() + 5 * 60 * 1000;
      }
    }

    setAudioDisabled(disabled, idx) {
      if (this.playlist[idx]) {
        this.playlist[idx].disabled = disabled;
      }
    }

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

    async sendPlayingEvent(reason = 'UNKNOWN') {
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:PLAY_STATE',
        data: {
          isPlaying: this.playing,
          reason,
        },
      });
    }

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

    async sendVolumeEvent() {
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:VOLUME',
        data: this.volume * 100,
      });
    }

    async sendPlaylistEvent() {
      // Howl instances cannot be cloned or sent across extension/Electron
      // message boundaries, so strip them from every outbound playlist event.
      playerSendMessage(this.mode, {
        type: 'BG_PLAYER:PLAYLIST',
        data: this.playlist.map((audio) => ({ ...audio, howl: undefined })),
      });
    }
  }

  // Setup our new audio player class and pass it the playlist.

  const threadPlayer = new Player();
  threadPlayer.setRefreshRate();
  window.threadPlayer = threadPlayer;

  if ('mediaSession' in navigator) {
    const { mediaSession } = navigator;
    mediaSession.setActionHandler('play', () => {
      threadPlayer.play();
    });
    mediaSession.setActionHandler('pause', () => {
      threadPlayer.pause();
    });
    mediaSession.setActionHandler('seekforward', (details) => {
      // User clicked "Seek Forward" media notification icon.
      const { currentHowl } = threadPlayer;
      if (!currentHowl) return;
      const skipTime = details.seekOffset || threadPlayer.skipTime;
      const newTime = Math.min(
        currentHowl.seek() + skipTime,
        currentHowl.duration()
      );
      threadPlayer.seekTime(newTime);
      threadPlayer.sendFrameUpdate();
    });
    mediaSession.setActionHandler('seekbackward', (details) => {
      // User clicked "Seek Backward" media notification icon.
      const { currentHowl } = threadPlayer;
      if (!currentHowl) return;
      const skipTime = details.seekOffset || threadPlayer.skipTime;
      const newTime = Math.max(currentHowl.seek() - skipTime, 0);
      threadPlayer.seekTime(newTime);
      threadPlayer.sendFrameUpdate();
    });
    mediaSession.setActionHandler('seekto', (details) => {
      const { seekTime } = details;
      threadPlayer.seekTime(seekTime);
      threadPlayer.sendFrameUpdate();
    });
    mediaSession.setActionHandler('nexttrack', () => {
      threadPlayer.skip('next');
      threadPlayer.sendFrameUpdate();
    });
    mediaSession.setActionHandler('previoustrack', () => {
      threadPlayer.skip('prev');
      threadPlayer.sendFrameUpdate();
    });
  }
  playerSendMessage(threadPlayer.mode, {
    type: 'BG_PLAYER:READY',
  });
}
