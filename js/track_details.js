/* global i18next MediaService l1Player RequestTask */
/* exported injectTrackDetails */

const injectTrackDetails = (app) => {
  app.factory('TrackPresentation', [
    '$rootScope',
    ($rootScope) => {
      const covers = new Map();
      const cache = new Map();
      const sameSource = (a, b) =>
        a?.url === b?.url &&
        a?.platform === b?.platform &&
        a?.identity === b?.identity;
      const cover = (track) => {
        if (!window.listen1Desktop || !track?.cover_asset_id)
          return Promise.resolve(track?.img_url || '');
        const id = track.cover_asset_id;
        if (!covers.has(id)) {
          covers.set(
            id,
            window.listen1Desktop.localCoverUrl(id).catch(() => '')
          );
          while (covers.size > 256) covers.delete(covers.keys().next().value);
        }
        return covers.get(id);
      };
      return {
        cover,
        hydrate(track) {
          const id = track?.id;
          const asset = track?.cover_asset_id;
          if (!asset) return;
          cover(track).then((url) =>
            $rootScope.$evalAsync(() => {
              if (
                track.id !== id ||
                track.cover_asset_id !== asset ||
                track.img_url === url
              )
                return;
              const fields = { img_url: url };
              Object.assign(track, fields);
              l1Player.updateTrackMetadata(id, fields);
              $rootScope.$broadcast('track:metadata', id, fields);
            })
          );
        },
        invalidate(id) {
          cache.delete(id);
        },
        async cached(track) {
          const entry = cache.get(track.id);
          if (!entry || entry.expires <= Date.now()) return null;
          const source = await l1Player.getResolvedAudioSource(track.id);
          return !source || sameSource(source, entry.source)
            ? entry.info
            : null;
        },
        query(track) {
          const started = Date.now();
          const requestId = `details-${Date.now()}-${Math.random().toString(36).slice(2)}`;
          return RequestTask.create(
            async ({ resolve, reject, signal, onCleanup }) => {
              let task;
              onCleanup(() => {
                task?.cancel();
                window.listen1Desktop
                  .cancelAudioInspection(requestId)
                  .catch(() => {});
              });
              try {
                let source = await l1Player.getResolvedAudioSource(track.id);
                if (!track.id.startsWith('lmtrack_') && !source) {
                  task = MediaService.bootstrapTrack(
                    track,
                    () => {},
                    () => {}
                  );
                  if (signal.aborted) {
                    task.cancel();
                    return;
                  }
                  source = await task.promise;
                }
                if (signal.aborted) return;
                const info = await window.listen1Desktop.inspectAudioSource({
                  requestId,
                  trackId: track.id,
                  url: source?.url,
                  platform: source?.platform,
                  timeoutMs: Math.max(1, 15000 - (Date.now() - started)),
                });
                if (signal.aborted) return;
                const current = await l1Player.getResolvedAudioSource(track.id);
                if (current && !sameSource(source, current))
                  throw Object.assign(new Error('Source changed'), {
                    code: 'SOURCE_CHANGED',
                  });
                if (
                  info.error === 'CANCELLED' ||
                  info.error === 'SOURCE_CHANGED'
                )
                  throw Object.assign(new Error(info.error), {
                    code: info.error,
                  });
                cache.delete(track.id);
                cache.set(track.id, {
                  source,
                  info,
                  expires: Date.now() + 5 * 60000,
                });
                while (cache.size > 128)
                  cache.delete(cache.keys().next().value);
                resolve(info);
              } catch (error) {
                reject(error);
              }
            },
            { timeout: 15000 }
          );
        },
      };
    },
  ]);

  app.filter('coverImageUrl', () => (url, size) => {
    if (!url) return 'images/mycover.jpg';
    if (!size || !/^https?:/i.test(url)) return url;
    return `${url}${url.includes('?') ? '&' : '?'}param=${size}`;
  });
  app.directive('trackCover', [
    'TrackPresentation',
    (presentation) => ({
      restrict: 'A',
      link(scope, element, attrs) {
        scope.$watch(
          () => scope.$eval(attrs.trackCover),
          (track) => presentation.hydrate(track)
        );
      },
    }),
  ]);

  app.directive('trackDetails', [
    '$rootScope',
    '$timeout',
    'TrackPresentation',
    ($rootScope, $timeout, presentation) => ({
      restrict: 'E',
      scope: { theme: '=' },
      template: `<div class="track-manager-overlay" ng-if="state.target" ng-keydown="key($event)" ng-mousedown="press($event)" ng-mousemove="move($event)" ng-mouseup="release($event)" ng-click="backdrop($event)">
    <section class="track-manager-dialog track-details-dialog" role="dialog" aria-modal="true" aria-labelledby="track-details-title" data-target-id="{{state.target.id}}">
      <header><h2 id="track-details-title">{{t('_TRACK_DETAILS')}}</h2><button type="button" class="track-manager-close" ng-click="close()" aria-label="{{t('_LYRIC_CLOSE')}}">×</button></header>
      <dl class="track-details-fields"><div ng-repeat="row in detailRows track by row.key" data-detail-field="{{row.key}}"><dt>{{t(row.key)}}</dt><dd>{{row.value}}</dd></div></dl>
      <div class="track-details-read"><button type="button" class="read-audio-info" ng-if="!local()" ng-click="read()" ng-disabled="state.loading">{{t('_READ_AUDIO_INFO')}}</button><small ng-if="!local()">{{t('_AUDIO_READ_HELP')}}</small><p ng-if="state.loading" role="status">{{t('_LYRIC_LOADING')}}</p><p class="track-manager-error" ng-if="state.error">{{state.error}}</p></div>
    </section></div>`,
      link(boundScope, element) {
        const scope = boundScope;
        let generation = 0;
        let request;
        let previousFocus;
        let press;
        let canClose = false;
        scope.state = {};
        scope.t = (key) => i18next.t(key);
        scope.local = () => scope.state.target?.id.startsWith('lmtrack_');
        scope.close = () => {
          generation += 1;
          request?.cancel();
          request = null;
          scope.state = {};
          if (previousFocus && document.contains(previousFocus))
            previousFocus.focus();
        };
        const update = (state, epoch, action) => {
          if (scope.state === state && generation === epoch)
            scope.$evalAsync(() => {
              if (scope.state === state && generation === epoch) action();
            });
        };
        scope.read = () => {
          request?.cancel();
          generation += 1;
          const epoch = generation;
          const { state } = scope;
          state.loading = true;
          state.error = '';
          request = presentation.query({ ...state.target });
          request.promise
            .then((info) =>
              update(state, epoch, () => {
                state.loading = false;
                state.info = info;
                if (
                  info.originalLyric &&
                  !state.target.lyric_provenance &&
                  info.originalLyric.lyric &&
                  info.originalLyric.lyric === state.target.lyrics?.[0]
                ) {
                  state.target.lyric_provenance = info.originalLyric.provenance;
                  window.Lyrics.rememberOrigin(
                    state.target.id,
                    info.originalLyric.provenance
                  );
                }
                if (info.error) state.error = scope.t('_AUDIO_PARTIAL');
              })
            )
            .catch((error) =>
              update(state, epoch, () => {
                state.loading = false;
                if (error.code !== 'CANCELLED')
                  state.error = scope.t('_AUDIO_PARTIAL');
              })
            );
        };
        const duration = (value) => {
          if (!Number.isFinite(value) || value <= 0) return '';
          const seconds = Math.floor(value);
          return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
        };
        scope.rows = () => {
          const track = scope.state.target;
          if (!track) return [];
          const info = scope.state.info || {};
          const audio =
            info.audioInfo || (scope.local() ? track.audio_info : null) || {};
          const origin = window.Lyrics.getProvenance(track.id, track);
          const quality = [];
          if (typeof audio.lossless === 'boolean')
            quality.push(
              scope.t(audio.lossless ? '_AUDIO_LOSSLESS' : '_AUDIO_LOSSY')
            );
          if (audio.bitrate)
            quality.push(`${Math.round(audio.bitrate / 1000)} kbps`);
          if (audio.bitsPerSample) quality.push(`${audio.bitsPerSample} bit`);
          if (audio.sampleRate)
            quality.push(`${Number((audio.sampleRate / 1000).toFixed(3))} kHz`);
          const size = info.fileSize;
          const entries = [
            ['_TRACK_TITLE', track.title || ''],
            ['_ARTIST', track.artist || ''],
            ['_ALBUM', track.album || ''],
            ['_COVER_FILE_NAME', track.cover_file_name || ''],
            ['_LYRIC_FILE_NAME', origin?.fileName || ''],
            ['_AUDIO_QUALITY', quality.join(' · ')],
            [
              '_AUDIO_CODEC',
              [
                audio.codec,
                audio.container && audio.container !== audio.codec
                  ? audio.container
                  : '',
              ]
                .filter(Boolean)
                .join(' / '),
            ],
            ['_AUDIO_DURATION', duration(audio.duration)],
            [
              '_AUDIO_FILE_PATH',
              scope.local() ? info.filePath || track.id.slice(8) : '',
            ],
            [
              '_AUDIO_FILE_SIZE',
              Number.isFinite(size)
                ? `${size.toLocaleString()} B${size >= 1024 ? ` (${(size / (size >= 1048576 ? 1048576 : 1024)).toFixed(2)} ${size >= 1048576 ? 'MiB' : 'KiB'})` : ''}`
                : '',
            ],
          ];
          if (!scope.local())
            entries.push([
              '_LYRIC_SOURCE_PLATFORM',
              origin?.platform ? scope.t(origin.platform) : '',
            ]);
          return entries.map(([key, value]) => ({ key, value }));
        };
        scope.$watch(
          scope.rows,
          (rows) => {
            scope.detailRows = rows;
          },
          true
        );
        scope.$on('track-details:open', (event, track) => {
          scope.close();
          if (!window.listen1Desktop || !track?.id) return;
          previousFocus = document.activeElement;
          scope.state = { target: { ...track } };
          const { state } = scope;
          const epoch = generation;
          if (scope.local()) scope.read();
          else
            presentation.cached(track).then((info) =>
              update(state, epoch, () => {
                state.info = info;
              })
            );
          $timeout(() => {
            if (scope.state === state)
              element[0].querySelector('.track-manager-close')?.focus();
          });
        });
        scope.$on('track:metadata', (event, id, fields) => {
          if (scope.state.target?.id === id)
            Object.assign(scope.state.target, fields);
        });
        scope.$on('lyrics:changed', () => scope.$evalAsync());
        const unsubscribe = l1Player.onAudioSourceChanged(({ id }) => {
          presentation.invalidate(id);
          if (scope.state.target?.id === id) {
            generation += 1;
            request?.cancel();
            const { state } = scope;
            update(state, generation, () => {
              state.info = null;
              state.loading = false;
            });
          }
        });
        scope.press = (event) => {
          canClose = false;
          press =
            event.target === event.currentTarget && event.button === 0
              ? [event.clientX, event.clientY]
              : null;
        };
        scope.release = (event) => {
          canClose =
            !!press &&
            event.target === event.currentTarget &&
            Math.hypot(event.clientX - press[0], event.clientY - press[1]) <= 5;
          press = null;
        };
        scope.move = (event) => {
          if (
            press &&
            Math.hypot(event.clientX - press[0], event.clientY - press[1]) > 5
          )
            press = null;
        };
        scope.backdrop = (event) => {
          if (canClose && event.target === event.currentTarget) scope.close();
          canClose = false;
        };
        scope.key = (event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            scope.close();
          }
          if (event.key === 'Tab') {
            const buttons = [...element[0].querySelectorAll('button')].filter(
              (button) => !button.disabled && button.offsetParent !== null
            );
            if (
              document.activeElement ===
              (event.shiftKey ? buttons[0] : buttons.at(-1))
            ) {
              event.preventDefault();
              (event.shiftKey ? buttons.at(-1) : buttons[0])?.focus();
            }
          }
        };
        scope.$watch('theme', (value, previous) => {
          if (value !== previous) scope.close();
        });
        const languageChanged = () => scope.$evalAsync();
        i18next.on('languageChanged', languageChanged);
        scope.$on('$destroy', () => {
          scope.close();
          unsubscribe();
          i18next.off('languageChanged', languageChanged);
        });
      },
    }),
  ]);
};
window.injectTrackDetails = injectTrackDetails;
