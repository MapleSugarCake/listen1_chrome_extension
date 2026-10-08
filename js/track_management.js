/* global angular i18next sourceList MediaService l1Player */

// Previews never write storage; targets and request generations are immutable.
function bindLyricEditor(boundScope, root) {
  const scope = boundScope;
  let generation = 0;
  let task;
  let checkGeneration = 0;
  let checkTask;
  let disposed = false;
  let retryAction;
  scope.state = {};
  scope.t = (key) => i18next.t(key);
  scope.time = (ms) =>
    `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${((ms / 1000) % 60)
      .toFixed(3)
      .padStart(6, '0')}`;
  scope.offsetText = () =>
    `${
      (scope.state.offsetMs > 0 ? '+' : '') +
      (scope.state.offsetMs / 1000).toFixed(1)
    } ${scope.t('_LYRIC_SECONDS')}`;
  const update = (valid, action) => {
    if (valid())
      scope.$evalAsync(() => {
        if (valid()) action();
      });
  };
  scope.fail = (error, retry) => {
    const keys = {
      NO_SYNC_LYRIC: '_LYRIC_NO_SYNC',
      INVALID_UTF8: '_LYRIC_INVALID_UTF8',
      LYRIC_TOO_LARGE: '_LYRIC_TOO_LARGE',
      INVALID_LRC_FILE: '_LYRIC_INVALID_FILE',
      LYRIC_READ_FAILED: '_LYRIC_READ_FAILED',
      LYRIC_STORAGE: '_LYRIC_STORAGE_FAILED',
      LOCAL_METADATA: '_LOCAL_INVALID_TITLE',
      LOCAL_TRACK_MISSING: '_LOCAL_TRACK_MISSING',
    };
    scope.state.error = error.line
      ? i18next.t('_LYRIC_INVALID_LINE', { line: error.line })
      : i18next.t(keys[error.code] || `_ERROR_${error.code}`, {
          defaultValue: scope.t('_ERROR_UNKNOWN'),
        });
    scope.state.errorCode = error.code;
    scope.state.message = '';
    scope.state.canRetry = !!retry;
    retryAction = retry;
  };
  scope.retry = () => retryAction?.();
  scope.cancelPreview = () => {
    generation += 1;
    task?.cancel();
    task = null;
    scope.state.previewing = false;
    scope.state.importing = false;
    scope.state.preview = null;
    scope.state.candidateId = null;
  };
  scope.cancelCheck = () => {
    checkGeneration += 1;
    checkTask?.cancel();
    checkTask = null;
    scope.state.checking = false;
  };
  scope.cancel = () => {
    scope.cancelPreview();
    scope.cancelCheck();
  };
  scope.openTarget = (track) => {
    scope.cancel();
    scope.state = {
      target: { ...track },
      offsetMs: window.Lyrics.getOffset(track.id),
    };
  };
  const begin = () => {
    scope.cancelPreview();
    scope.state.error = '';
    scope.state.errorCode = null;
    scope.state.message = '';
    scope.state.canRetry = false;
    const target = scope.state.target.id;
    const request = generation;
    return () =>
      !disposed && request === generation && scope.state.target?.id === target;
  };
  function fetchPreview(track, restoring = false) {
    const valid = begin();
    const { state } = scope;
    state.previewing = true;
    state.candidateId = restoring ? null : track.id;
    state.candidateSource = track.source;
    task = MediaService.getLyric(
      track.id,
      track.album_id,
      track.lyric_url,
      track.tlyric_url,
      { original: true }
    );
    task.promise
      .then((data) =>
        update(valid, () => {
          state.previewing = false;
          let replacement;
          try {
            replacement = window.Lyrics.normalize(data);
          } catch (error) {
            if (!restoring || error.code !== 'NO_SYNC_LYRIC') {
              scope.fail(error, () => fetchPreview(track, restoring));
              return;
            }
            replacement = { lyric: '', tlyric: '' };
          }
          if (restoring) {
            try {
              window.Lyrics.removeOverride(state.target.id);
              state.offsetMs = 0;
              scope.cancelCheck();
              state.syncAvailable = !!replacement.lyric;
              window.Lyrics.forget(state.target.id);
              root.$broadcast('lyrics:changed', state.target.id);
              state.message = scope.t('_LYRIC_RESTORED');
            } catch (error) {
              scope.fail(error, () => fetchPreview(track, true));
              return;
            }
          }
          state.preview = {
            ...replacement,
            ready: !restoring,
            lines: window.Lyrics.parse(replacement.lyric, replacement.tlyric),
            label: restoring
              ? scope.t('_LYRIC_ORIGINAL')
              : `${track.title} · ${scope.t(track.source)}`,
          };
        })
      )
      .catch((error) => {
        if (error.code !== 'CANCELLED')
          update(valid, () => {
            state.previewing = false;
            scope.fail(error, () => fetchPreview(track, restoring));
          });
      });
  }
  scope.select = (track) => fetchPreview(track);
  scope.restore = () => {
    if (scope.state.target) fetchPreview(scope.state.target, true);
  };
  scope.importLyric = () => {
    const valid = begin();
    const { state } = scope;
    state.importing = true;
    window.listen1Desktop
      .importLocalLyric()
      .then((result) =>
        update(valid, () => {
          state.importing = false;
          if (result.cancelled) return;
          if (result.error) {
            scope.fail(result.error, scope.importLyric);
            return;
          }
          const check = window.Lyrics.validateLocal(result.lyric);
          if (!check.valid) {
            scope.fail(check, scope.importLyric);
            return;
          }
          const replacement = window.Lyrics.normalize({
            lyric: result.lyric,
            tlyric: '',
          });
          state.preview = {
            ...replacement,
            ready: true,
            label: result.fileName,
            lines: window.Lyrics.parse(replacement.lyric, ''),
          };
        })
      )
      .catch(() =>
        update(valid, () => {
          state.importing = false;
          scope.fail({ code: 'LYRIC_READ_FAILED' }, scope.importLyric);
        })
      );
  };
  scope.apply = () => {
    const { state } = scope;
    if (
      !state.target ||
      !state.preview?.ready ||
      state.previewing ||
      state.importing
    )
      return;
    try {
      window.Lyrics.saveOverride(state.target.id, state.preview);
      generation += 1;
      scope.cancelCheck();
      state.syncAvailable = true;
      state.offsetMs = 0;
      window.Lyrics.forget(state.target.id);
      root.$broadcast('lyrics:changed', state.target.id);
      state.error = '';
      state.errorCode = null;
      state.canRetry = false;
      state.message = scope.t('_LYRIC_SAVED');
    } catch (error) {
      scope.fail(error, scope.apply);
    }
  };
  scope.checkSync = () => {
    scope.cancelCheck();
    const { state } = scope;
    const { id } = state.target;
    const request = checkGeneration;
    const valid = () =>
      !disposed && request === checkGeneration && scope.state.target?.id === id;
    const render = (data) => {
      state.syncAvailable = window.Lyrics.parse(data?.lyric, '').some((line) =>
        line.content.trim()
      );
      state.checking = false;
      state.checkError = '';
    };
    const cached = window.Lyrics.getOverride(id) || window.Lyrics.getLoaded(id);
    if (cached) {
      render(cached);
      return;
    }
    state.checking = true;
    state.checkError = '';
    state.syncAvailable = false;
    checkTask = MediaService.getLyric(
      id,
      state.target.album_id,
      state.target.lyric_url,
      state.target.tlyric_url
    );
    checkTask.promise
      .then((data) => update(valid, () => render(data)))
      .catch((error) => {
        if (error.code !== 'CANCELLED')
          update(valid, () => {
            state.checking = false;
            state.checkError = i18next.t(`_ERROR_${error.code}`, {
              defaultValue: scope.t('_ERROR_UNKNOWN'),
            });
          });
      });
  };
  scope.toggleTiming = () => {
    scope.state.timingOpen = !scope.state.timingOpen;
    if (scope.state.timingOpen) scope.checkSync();
    else scope.cancelCheck();
  };
  scope.adjust = (delta) => {
    const { state } = scope;
    if (!state.target || (delta !== 0 && !state.syncAvailable)) return;
    const offset =
      delta === 0 ? 0 : window.Lyrics.getOffset(state.target.id) + delta;
    if (Math.abs(offset) > 60000) return;
    try {
      window.Lyrics.setOffset(state.target.id, offset);
      state.offsetMs = offset;
      state.error = '';
      state.errorCode = null;
      state.canRetry = false;
      state.message = '';
      root.$broadcast('lyrics:offset-changed', state.target.id);
    } catch (error) {
      scope.fail(error, () => scope.adjust(delta));
    }
  };
  scope.$on('lyrics:changed', (event, id) => {
    if (scope.state.target?.id !== id) return;
    scope.state.offsetMs = window.Lyrics.getOffset(id);
    if (scope.state.timingOpen) scope.checkSync();
  });
  scope.$on('lyrics:offset-changed', (event, id) => {
    if (scope.state.target?.id === id)
      scope.state.offsetMs = window.Lyrics.getOffset(id);
  });
  scope.$on('$destroy', () => {
    disposed = true;
    scope.cancel();
  });
}

const lyricPreviewTemplate = `<div class="track-manager-preview" ng-if="state.preview">
  <h3>{{t('_LYRIC_PREVIEW')}} — {{state.preview.label}}</h3>
  <p ng-repeat="line in state.preview.lines track by $index" ng-class="{translation: line.translationFlag}"><time>{{time(line.seconds)}}</time> {{line.content}}</p>
  </div><button type="button" class="apply-lyrics" ng-if="state.preview || state.previewing || state.importing || state.error" ng-click="apply()" ng-disabled="!state.preview.ready || state.previewing || state.importing">{{t('_LYRIC_APPLY')}}</button>`;
const lyricFeedbackTemplate = `<p ng-if="state.previewing || state.importing" role="status">{{t('_LYRIC_LOADING')}}</p>
  <p class="track-manager-error" ng-if="state.error" role="alert">{{state.error}} <button type="button" ng-if="state.canRetry" ng-click="retry()">{{t('_LYRIC_RETRY')}}</button></p>
  <p class="track-manager-message" ng-if="state.message" role="status">{{state.message}}</p>`;

window.injectTrackManagement = (app) => {
  app.factory('LyricSearchSession', [
    '$rootScope',
    ($rootScope) => {
      const editor = $rootScope.$new(true);
      bindLyricEditor(editor, $rootScope);
      const session = { editor, active: false, origin: null };
      const sources = sourceList.filter(
        (source) => source.searchable !== false
      );
      let generation = 0;
      const tasks = new Map();
      const cancel = () => {
        generation += 1;
        tasks.forEach((task) => task.cancel());
        tasks.clear();
        if (editor.state.cache)
          Object.values(editor.state.cache).forEach((pages) => {
            Object.values(pages).forEach((page) => {
              if (page.state === 'pending')
                Object.assign(page, { state: 'error', code: 'CANCELLED' });
            });
          });
        editor.state.searching = false;
      };
      session.render = () => {
        const { state } = editor;
        if (!state.cache) return;
        state.curpage = state.pages[state.source];
        const names =
          state.source === 'allmusic'
            ? sources.map((source) => source.name)
            : [state.source];
        state.candidates = [];
        state.sourceStates = [];
        state.hasMore = false;
        names.forEach((name) => {
          const page = state.cache[name]?.[state.curpage];
          if (page) {
            state.candidates.push(...(page.result || []));
            state.sourceStates.push({ name, ...page, result: undefined });
            state.hasMore ||= !!page.hasMore;
          }
        });
        state.searching = tasks.size > 0;
      };
      session.load = (retrySource, all = false) => {
        const { state } = editor;
        if (!session.active || !state.keywords?.trim()) return;
        const request = generation;
        const { id } = state.target;
        const valid = () =>
          session.active &&
          request === generation &&
          editor.state.target?.id === id;
        const pageNumber = all ? 1 : state.pages[state.source];
        let names = sources.map((source) => source.name);
        if (retrySource) names = [retrySource];
        else if (!all && state.source !== 'allmusic') names = [state.source];
        names.forEach((name) => {
          const pages = state.cache[name];
          if (!retrySource && pages[pageNumber]) return;
          if (
            pageNumber > 1 &&
            pages[pageNumber - 1] &&
            !pages[pageNumber - 1].hasMore &&
            pages[pageNumber - 1].state !== 'error'
          ) {
            pages[pageNumber] = { state: 'empty', result: [], hasMore: false };
            return;
          }
          const key = `${name}:${pageNumber}`;
          if (tasks.has(key)) return;
          pages[pageNumber] = { state: 'pending', result: [] };
          const task = MediaService.search(name, {
            keywords: state.keywords.trim(),
            curpage: pageNumber,
            type: 0,
          });
          tasks.set(key, task);
          const finish = (data) => {
            if (!valid()) return;
            editor.$evalAsync(() => {
              if (!valid()) return;
              tasks.delete(key);
              pages[pageNumber] = data;
              session.render();
            });
          };
          task.promise
            .then((data) =>
              finish({
                ...data,
                state: data.result.length ? 'success' : 'empty',
              })
            )
            .catch((error) => {
              if (error.code !== 'CANCELLED')
                finish({ state: 'error', code: error.code, result: [] });
            });
        });
        session.render();
      };
      session.search = () => {
        cancel();
        editor.cancelPreview();
        const { state } = editor;
        state.cache = Object.fromEntries(
          sources.map((source) => [source.name, {}])
        );
        state.pages = Object.fromEntries(
          ['allmusic', ...sources.map((source) => source.name)].map(
            (source) => [source, 1]
          )
        );
        state.error = '';
        state.errorCode = null;
        state.message = '';
        state.searched = true;
        session.load(null, true);
        session.render();
      };
      session.open = (track) => {
        cancel();
        editor.openTarget(track);
        session.active = true;
        Object.assign(editor.state, {
          keywords: [track.title, track.artist].filter(Boolean).join(' '),
          source: 'allmusic',
        });
        $rootScope.$broadcast('lyric-search:open');
        session.search();
      };
      session.filter = (source) => {
        editor.state.source = source;
        session.render();
      };
      session.page = (direction) => {
        const { state } = editor;
        if (
          state.searching ||
          (direction > 0 && !state.hasMore) ||
          (direction < 0 && state.curpage <= 1)
        )
          return;
        state.pages[state.source] += direction;
        session.load();
        session.render();
      };
      session.suspend = () => {
        cancel();
        editor.cancel();
        session.render();
      };
      session.leave = () => {
        session.suspend();
        session.active = false;
        session.origin = null;
      };
      session.sources = sources;
      return session;
    },
  ]);

  app.directive('trackActions', [
    '$rootScope',
    ($rootScope) => ({
      restrict: 'E',
      scope: { track: '=' },
      template: `<span class="track-actions" ng-if="desktop && track.id" data-track-id="{{track.id}}">
      <a class="manage-lyrics icon" role="button" tabindex="0" ng-click="open('lyrics', $event)" ng-keydown="activate('lyrics', $event)" title="{{t('_LYRIC_MANAGE')}}" aria-label="{{t('_LYRIC_MANAGE')}}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 2h10l5 5v15H5V2zm2 2v16h11V8h-5V4H7zm2 7h7v2H9v-2zm0 4h7v2H9v-2z"/></svg></a>
      <a class="edit-local-track icon" role="button" tabindex="0" ng-if="local()" ng-click="open('metadata', $event)" ng-keydown="activate('metadata', $event)" title="{{t('_LOCAL_EDIT')}}" aria-label="{{t('_LOCAL_EDIT')}}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 17.3V21h3.7L18 9.7 14.3 6 3 17.3zM20.7 7a1 1 0 000-1.4l-2.3-2.3a1 1 0 00-1.4 0L15.2 5 19 8.8 20.7 7z"/></svg></a>
    </span>`,
      link(boundScope) {
        const scope = boundScope;
        scope.desktop = !!window.listen1Desktop;
        scope.t = (key) => i18next.t(key);
        scope.local = () => scope.track?.id?.startsWith('lmtrack_');
        scope.open = (mode, event) => {
          event.preventDefault();
          event.stopPropagation();
          $rootScope.$broadcast('track-manager:open', {
            track: scope.track,
            mode,
          });
        };
        scope.activate = (mode, event) => {
          if (event.key === 'Enter' || event.key === ' ')
            scope.open(mode, event);
        };
        scope.$on('track:metadata', (event, id, metadata) => {
          if (scope.track?.id === id) Object.assign(scope.track, metadata);
        });
      },
    }),
  ]);

  app.directive('trackManager', [
    '$rootScope',
    '$timeout',
    'LyricSearchSession',
    ($rootScope, $timeout, session) => ({
      restrict: 'E',
      scope: { theme: '=' },
      template: `<div class="track-manager-overlay" ng-if="state.target" ng-keydown="key($event)" ng-mousedown="press($event)" ng-mouseup="release($event)" ng-mousemove="move($event)" ng-click="backdrop($event)">
      <section class="track-manager-dialog" role="dialog" aria-modal="true" aria-labelledby="track-manager-title" data-target-id="{{state.target.id}}">
      <header><h2 id="track-manager-title">{{t(state.mode === 'lyrics' ? '_LYRIC_MANAGE' : '_LOCAL_EDIT')}}</h2><button type="button" class="track-manager-close" ng-click="close()" aria-label="{{t('_LYRIC_CLOSE')}}">×</button></header>
      <p class="track-manager-target"><strong>{{state.target.title}}</strong><span ng-if="state.target.artist"> — {{state.target.artist}}</span><span ng-if="state.target.album"> · {{state.target.album}}</span></p>
      <div ng-if="state.mode === 'metadata'" class="track-metadata-form">
        <label>{{t('_TRACK_TITLE')}} <input class="metadata-title" ng-model="state.title" required></label>
        <label>{{t('_ARTIST')}} <input class="metadata-artist" ng-model="state.artist" placeholder="{{t('_LOCAL_OPTIONAL')}}"></label>
        <label>{{t('_ALBUM')}} <input class="metadata-album" ng-model="state.album" placeholder="{{t('_LOCAL_OPTIONAL')}}"></label>
        <button class="save-local-metadata" ng-click="saveMetadata()" ng-disabled="!state.title.trim()">{{t('_LOCAL_SAVE')}}</button>
      </div>
      <div ng-if="state.mode === 'lyrics'">
        <div class="lyric-import-actions"><button class="open-lyric-search" ng-click="openSearch()">{{t('_LYRIC_SEARCH')}}</button><button class="import-local-lyric" ng-click="importLyric()" ng-disabled="state.importing">{{t('_LYRIC_IMPORT')}}</button><button class="restore-original-lyric" ng-click="restore()" ng-disabled="state.previewing">{{t('_LYRIC_RESTORE')}}</button><small>{{t('_LYRIC_IMPORT_HELP')}}</small></div>
        <div class="lyric-timing"><button class="toggle-lyric-timing" ng-click="toggleTiming()" aria-expanded="{{!!state.timingOpen}}">{{t('_LYRIC_TIMING')}} <span ng-if="!state.timingOpen && state.offsetMs">{{offsetText()}}</span><span aria-hidden="true">{{state.timingOpen ? '⌃' : '⌄'}}</span></button>
        <div ng-if="state.timingOpen" class="lyric-timing-controls">
          <output aria-live="polite">{{t('_LYRIC_OFFSET')}} {{offsetText()}}</output>
          <button class="lyric-earlier" ng-click="adjust(-300)" ng-disabled="!state.syncAvailable || state.checking || state.offsetMs <= -60000">{{t('_LYRIC_EARLIER')}}</button><button class="lyric-later" ng-click="adjust(300)" ng-disabled="!state.syncAvailable || state.checking || state.offsetMs >= 60000">{{t('_LYRIC_LATER')}}</button><button class="lyric-reset" ng-click="adjust(0)" ng-disabled="!state.offsetMs">{{t('_LYRIC_RESET')}}</button>
          <small>{{t('_LYRIC_TIMING_HELP')}}</small><p ng-if="state.checking">{{t('_LYRIC_LOADING')}}</p><p ng-if="!state.checking && !state.syncAvailable && !state.checkError">{{t('_LYRIC_NO_SYNC')}}</p><p ng-if="state.checkError" class="track-manager-error">{{state.checkError}} <button ng-click="checkSync()">{{t('_LYRIC_RETRY')}}</button></p>
        </div></div>
        ${lyricPreviewTemplate}
      </div>${lyricFeedbackTemplate}
      </section></div>`,
      link(boundScope, element) {
        const scope = boundScope;
        bindLyricEditor(scope, $rootScope);
        let previousFocus;
        let gesture;
        let canClose = false;
        scope.close = () => {
          scope.cancel();
          scope.state = {};
          gesture = null;
          canClose = false;
          if (previousFocus && document.contains(previousFocus))
            previousFocus.focus();
        };
        scope.press = (event) => {
          canClose = false;
          gesture = {
            outside: event.target === event.currentTarget && event.button === 0,
            x: event.clientX,
            y: event.clientY,
            dragged: false,
          };
        };
        scope.move = (event) => {
          if (
            gesture &&
            Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) > 5
          )
            gesture.dragged = true;
        };
        scope.release = (event) => {
          scope.move(event);
          canClose =
            !!gesture?.outside &&
            !gesture.dragged &&
            event.target === event.currentTarget;
          gesture = null;
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
            const controls = [
              ...element[0].querySelectorAll('button,input'),
            ].filter((c) => !c.disabled && c.offsetParent !== null);
            const edge = event.shiftKey ? controls[0] : controls.at(-1);
            if (document.activeElement === edge) {
              event.preventDefault();
              (event.shiftKey ? controls.at(-1) : controls[0])?.focus();
            }
          }
        };
        scope.$on('track-manager:open', (event, data) => {
          if (!window.listen1Desktop || !data.track?.id) return;
          scope.close();
          previousFocus = document.activeElement;
          scope.openTarget(data.track);
          Object.assign(scope.state, {
            mode: data.mode,
            title: data.track.title || '',
            artist: data.track.artist || '',
            album: data.track.album || '',
          });
          const { state } = scope;
          $timeout(() => {
            if (scope.state === state)
              element[0]
                .querySelector(
                  data.mode === 'metadata'
                    ? '.metadata-title'
                    : '.open-lyric-search'
                )
                ?.focus();
          });
        });
        scope.openSearch = () => {
          const track = scope.state.target;
          scope.close();
          session.open(track);
        };
        scope.saveMetadata = () => {
          const { state } = scope;
          try {
            const metadata = MediaService.updateLocalTrack(state.target.id, {
              title: state.title,
              artist: state.artist,
              album: state.album,
            });
            l1Player.updateTrackMetadata(state.target.id, metadata);
            $rootScope.$broadcast('track:metadata', state.target.id, metadata);
            Object.assign(state.target, metadata);
            state.error = '';
            state.errorCode = null;
            state.canRetry = false;
            state.message = scope.t('_LOCAL_SAVED');
          } catch (error) {
            scope.fail(error, scope.saveMetadata);
          }
        };
        scope.$watch('theme', (value, previous) => {
          if (value !== previous) scope.close();
        });
        const languageChanged = () => scope.$evalAsync();
        i18next.on('languageChanged', languageChanged);
        scope.$on('$destroy', () => {
          scope.close();
          i18next.off('languageChanged', languageChanged);
        });
      },
    }),
  ]);

  app.directive('lyricSearchPage', [
    '$rootScope',
    'LyricSearchSession',
    ($rootScope, session) => ({
      restrict: 'E',
      scope: {},
      template: `<section class="lyric-search-page" ng-if="session.active" aria-labelledby="lyric-search-title">
      <header><button class="lyric-search-back" ng-click="back()">‹ {{t('_LYRIC_BACK')}}</button><h2 id="lyric-search-title">{{t('_LYRIC_SEARCH')}}</h2></header>
      <p class="lyric-search-target">{{t('_LYRIC_TARGET')}} <strong>{{state.target.title}}</strong><span ng-if="state.target.artist"> — {{state.target.artist}}</span></p>
      <form class="lyric-search-form" ng-submit="submit()"><input class="lyric-search-keywords" type="search" ng-model="state.keywords" ng-model-options="{debounce: 500}" ng-change="search()" aria-label="{{t('_LYRIC_KEYWORDS')}}" placeholder="{{t('_LYRIC_KEYWORDS')}}"><button type="submit" class="search-lyrics" ng-disabled="!state.keywords.trim()">{{t('_LYRIC_SEARCH')}}</button></form>
      <ul class="source-list lyric-source-tabs"><li class="source-button" ng-class="{active: state.source === 'allmusic'}"><button data-lyric-source="allmusic" ng-click="filter('allmusic')">{{t('_LYRIC_ALL_PLATFORMS')}}</button></li><li class="source-button" ng-repeat="source in sources" ng-class="{active: state.source === source.name}"><button data-lyric-source="{{source.name}}" ng-click="filter(source.name)">{{t(source.displayId)}}</button></li></ul>
      <div class="lyric-search-columns"><div class="lyric-search-results">
      <ul class="lyric-source-status"><li ng-repeat="source in state.sourceStates">{{t(source.name)}}: {{sourceMessage(source)}} <button ng-if="source.state === 'error'" ng-click="retrySource(source.name)">{{t('_LYRIC_RETRY')}}</button></li></ul>
      <p ng-if="state.searching" role="status">{{t('_LYRIC_LOADING')}}</p><p ng-if="state.searched && !state.searching && !state.candidates.length">{{t('_LYRIC_NO_CANDIDATES')}}</p>
      <ul class="detail-songlist lyric-candidates"><li class="head"><div class="title">{{t('_SONGS')}}</div><div class="artist">{{t('_ARTISTS')}}</div><div class="album">{{t('_ALBUMS')}}</div></li><li ng-repeat="candidate in state.candidates track by (candidate.source + ':' + candidate.id)" class="lyric-candidate" data-candidate-id="{{candidate.id}}" ng-class="{selected: state.candidateId === candidate.id && state.candidateSource === candidate.source}" ng-click="select(candidate)" ng-keydown="candidateKey($event, candidate)" tabindex="0" role="button"><div class="title"><strong>{{candidate.title}}</strong><small>{{t(candidate.source)}}</small></div><div class="artist">{{candidate.artist}}</div><div class="album">{{candidate.album}}</div></li></ul>
      <nav class="lyric-pagination" ng-if="state.searched"><button ng-click="page(-1)" ng-disabled="state.curpage <= 1 || state.searching">{{t('_LYRIC_PREVIOUS')}}</button><span>{{state.curpage}}</span><button ng-click="page(1)" ng-disabled="!state.hasMore || state.searching">{{t('_LYRIC_NEXT')}}</button></nav>
      </div><aside class="lyric-search-preview">${lyricPreviewTemplate}${lyricFeedbackTemplate}</aside></div>
    </section>`,
      link(boundScope, element) {
        const scope = boundScope;
        scope.session = session;
        scope.sources = session.sources;
        scope.$watch(
          () => session.editor.state,
          (state) => {
            scope.state = state;
          }
        );
        ['t', 'time', 'apply', 'select', 'retry'].forEach((name) => {
          scope[name] = session.editor[name];
        });
        scope.sourceMessage = (source) =>
          i18next.t(
            source.state === 'error'
              ? `_ERROR_${source.code}`
              : `_SEARCH_${source.state.toUpperCase()}`,
            { defaultValue: scope.t('_ERROR_UNKNOWN') }
          );
        scope.search = session.search;
        scope.page = session.page;
        scope.filter = session.filter;
        scope.retrySource = session.load;
        scope.submit = () => {
          const input = angular
            .element(element[0].querySelector('input'))
            .controller('ngModel');
          const unchanged = input?.$viewValue === input?.$modelValue;
          input?.$commitViewValue();
          if (unchanged) session.search();
        };
        scope.candidateKey = (event, track) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            scope.select(track);
          }
        };
        scope.back = () => $rootScope.$broadcast('lyric-search:back');
        const languageChanged = () => scope.$evalAsync();
        i18next.on('languageChanged', languageChanged);
        scope.$on('$destroy', () => {
          session.suspend();
          i18next.off('languageChanged', languageChanged);
        });
      },
    }),
  ]);
};
