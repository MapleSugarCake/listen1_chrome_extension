/* global l1Player i18next addPlayerListener */
/* eslint-disable no-param-reassign -- Angular directive link initializes its scope. */
// Both layouts use this directive; all state comes from the persistent player.
window.injectLoudnessControl = (app) => {
  app.directive('loudnessControl', () => ({
    restrict: 'A',
    scope: {},
    template: `<div class="loudness-control" ng-if="desktop">
      <button type="button" class="loudness-button" ng-class="{enabled: state.enabled}"
        ng-click="toggle()" title="{{t('_LOUDNESS_TITLE')}}" aria-label="{{t('_LOUDNESS_TITLE')}}"
        aria-expanded="{{open}}" aria-haspopup="dialog">
        <svg viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
          <path d="M4 2h2v3H4zm0 10h2v10H4zM11 2h2v12h-2zm0 19h2v1h-2zM18 2h2v6h-2zm0 13h2v9h-2z"/>
          <rect x="2" y="6" width="6" height="5" rx=".4"/>
          <rect x="9" y="15" width="6" height="5" rx=".4"/>
          <rect x="16" y="9" width="6" height="5" rx=".4"/>
        </svg>
      </button>
      <div class="loudness-panel" ng-if="open" role="dialog" aria-label="{{t('_LOUDNESS_TITLE')}}">
        <strong>{{t('_LOUDNESS_TITLE')}}</strong>
        <label class="loudness-switch"><input type="checkbox" ng-model="state.enabled" ng-change="change()"> {{t('_LOUDNESS_ENABLE')}}</label>
        <label class="loudness-mode">{{t('_LOUDNESS_MODE')}}
          <select ng-model="state.mode" ng-change="change()">
            <option value="standard">{{t('_LOUDNESS_STANDARD')}}</option>
            <option value="dynamic">{{t('_LOUDNESS_DYNAMIC')}}</option>
          </select>
        </label>
        <p>{{t(state.mode === 'dynamic' ? '_LOUDNESS_DYNAMIC_HELP' : '_LOUDNESS_STANDARD_HELP')}}</p>
        <p role="status" aria-live="polite">{{t('_LOUDNESS_STATE_' + state.status)}}
          <span ng-if="state.reason"> — {{t('_LOUDNESS_REASON_' + reason())}}</span>
        </p>
        <div ng-if="state.status === 'error'" class="loudness-actions">
          <button type="button" ng-click="retry()">{{t('_LOUDNESS_RETRY')}}</button>
          <button type="button" ng-click="disable()">{{t('_LOUDNESS_DISABLE')}}</button>
        </div>
      </div>
    </div>`,
    link(scope, element) {
      scope.desktop = !!window.listen1Desktop;
      if (!window.listen1Desktop) return;
      scope.open = false;
      scope.state = { enabled: false, mode: 'standard', status: 'off' };
      scope.t = (key) => i18next.t(key);
      scope.reason = () => {
        const code = scope.state.reason;
        if (
          [
            'UNSUPPORTED_SOURCE',
            'UNSUPPORTED_AUDIO',
            'NO_SIGNAL',
            'CHANNEL_LAYOUT',
          ].includes(code)
        )
          return code;
        if (['NETWORK_ERROR', 'FILE_MISSING', 'SOURCE_CHANGED'].includes(code))
          return 'READ_ERROR';
        return 'PROCESS_ERROR';
      };
      scope.change = () => l1Player.setLoudness(scope.state);
      scope.retry = () => l1Player.play();
      scope.disable = () => {
        scope.state.enabled = false;
        scope.change();
      };
      scope.toggle = () => {
        scope.open = !scope.open;
      };
      const close = (event) => {
        if (!scope.open) return;
        if (event.type === 'pointerdown' && element[0].contains(event.target))
          return;
        if (event.type === 'keydown' && event.key !== 'Escape') return;
        scope.$evalAsync(() => {
          scope.open = false;
        });
        if (event.type === 'keydown')
          element[0].querySelector('.loudness-button').focus();
      };
      const language = () => scope.$evalAsync();
      document.addEventListener('pointerdown', close);
      document.addEventListener('keydown', close);
      i18next.on('languageChanged', language);
      const unsubscribe = addPlayerListener('front', (message) => {
        if (message.type === 'BG_PLAYER:LOUDNESS') {
          scope.$evalAsync(() => {
            scope.state = { ...message.data };
          });
        }
      });
      l1Player.requestLoudness();
      scope.$on('$destroy', () => {
        unsubscribe();
        document.removeEventListener('pointerdown', close);
        document.removeEventListener('keydown', close);
        i18next.off('languageChanged', language);
      });
    },
  }));
};
