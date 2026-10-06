/**
 * 平台认证状态：区分未登录和查询失败，取消过期请求并同步账号切换。
 */
/* global angular MediaService isElectron i18next RequestTask */
angular.module('listenone').controller('AuthController', [
  '$scope',
  '$rootScope',
  ($scope, $rootScope) => {
    $scope.loginProgress = false;
    $scope.loginType = 'email';
    $scope.loginSourceList = MediaService.getLoginProviders().map(
      (item) => item.name
    );
    $scope.musicAuth = {};
    $scope.authStatus = {};
    const generations = new Map();
    const pending = new Map();
    let destroyed = false;

    const cancel = (source) => {
      generations.set(source, (generations.get(source) || 0) + 1);
      pending.get(source)?.cancel();
      pending.delete(source);
    };
    $scope.setMusicAuth = (source, data) => {
      $scope.musicAuth[source] = data;
      $rootScope.$broadcast('music-auth:changed', { source, user: data });
    };
    $scope.refreshAuthStatus = (selectedSource) => {
      const sources = selectedSource
        ? [selectedSource]
        : $scope.loginSourceList;
      sources
        .filter((source) => $scope.loginSourceList.includes(source))
        .forEach((source) => {
          cancel(source);
          const generation = generations.get(source);
          $scope.authStatus[source] = { loading: true, error: null };
          const current = () =>
            !destroyed && generation === generations.get(source);
          const fail = (error) => {
            if (!current() || error.code === 'CANCELLED') return;
            $scope.$evalAsync(() => {
              if (!current()) return;
              pending.delete(source);
              $scope.authStatus[source] = {
                loading: false,
                error: error.code,
                message: i18next.t(`_ERROR_${error.code}`),
              };
            });
          };
          const task = MediaService.getUser(source);
          pending.set(source, task);
          task
            .success((response) => {
              if (!current()) return;
              if (
                !response ||
                !['success', 'fail'].includes(response.status) ||
                (response.status === 'success' &&
                  (!response.data?.is_login || !response.data.user_id))
              ) {
                fail({ code: 'INVALID_RESPONSE' });
                return;
              }
              $scope.$evalAsync(() => {
                if (!current()) return;
                pending.delete(source);
                $scope.authStatus[source] = { loading: false, error: null };
                $scope.setMusicAuth(
                  source,
                  response.status === 'success' ? response.data : {}
                );
              });
            })
            .error(fail);
        });
    };
    $scope.logout = (source) => {
      cancel(source);
      $scope.authStatus[source] = { loading: false, error: null };
      $scope.setMusicAuth(source, {});
      MediaService.logout(source);
    };
    $scope.is_login = (source) => !!$scope.musicAuth[source]?.is_login;
    $scope.getLoginUrl = (source) => MediaService.getLoginUrl(source);
    $scope.openLogin = (source) => {
      const url = $scope.getLoginUrl(source);
      if (!isElectron()) return window.open(url, '_blank');
      return window.listen1Desktop.openLogin(url).catch((error) => {
        if (destroyed) return;
        const normalized = RequestTask.normalizeError(error, source, 'login');
        $scope.$evalAsync(() => {
          if (!destroyed)
            $scope.authStatus[source] = {
              loading: false,
              error: normalized.code,
              message: i18next.t(`_ERROR_${normalized.code}`),
            };
        });
      });
    };
    $scope.$on('$destroy', () => {
      destroyed = true;
      $scope.loginSourceList.forEach(cancel);
    });
  },
]);
