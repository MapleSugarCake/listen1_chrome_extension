/**
 * 平台歌单：管理加载、失败、重试及账号和分类切换时的请求生命周期。
 */
/* global angular MediaService i18next */
const platformSourceList = [
  { name: 'my_created_playlist', displayId: '_MY_CREATED_PLAYLIST' },
  { name: 'my_favorite_playlist', displayId: '_MY_FAVORITE_PLAYLIST' },
  { name: 'recommend_playlist', displayId: '_RECOMMEND_PLAYLIST' },
];
angular.module('listenone').controller('PlatformController', [
  '$scope',
  ($scope) => {
    $scope.myPlatformPlaylists = [];
    $scope.myPlatformUser = {};
    $scope.platformSourceList = platformSourceList;
    $scope.tab = platformSourceList[0].name;
    $scope.platformLoading = false;
    $scope.platformError = null;
    let generation = 0;
    let pending;
    let destroyed = false;
    const cancel = () => {
      generation += 1;
      pending?.cancel();
      pending = null;
    };
    $scope.loadPlatformPlaylists = () => {
      cancel();
      const request = generation;
      const user = $scope.myPlatformUser;
      $scope.myPlatformPlaylists = [];
      $scope.platformError = null;
      $scope.platformErrorMessage = '';
      $scope.platformLoading = !!user.platform;
      if (!$scope.platformLoading) return;
      const current = () => !destroyed && request === generation;
      const fail = (error) => {
        if (!current() || error.code === 'CANCELLED') return;
        $scope.$evalAsync(() => {
          if (!current()) return;
          pending = null;
          $scope.platformLoading = false;
          $scope.platformError = error.code;
          $scope.platformErrorMessage = i18next.t(`_ERROR_${error.code}`);
        });
      };
      let getPlaylist = MediaService.getUserCreatedPlaylist;
      if ($scope.tab === 'recommend_playlist')
        getPlaylist = MediaService.getRecommendPlaylist;
      else if ($scope.tab === 'my_favorite_playlist')
        getPlaylist = MediaService.getUserFavoritePlaylist;
      pending = getPlaylist(user.platform, { user_id: user.user_id });
      pending
        .success((response) => {
          if (!current()) return;
          if (
            response?.status !== 'success' ||
            !Array.isArray(response.data?.playlists)
          ) {
            fail({
              code:
                response?.status === 'fail'
                  ? 'AUTH_REQUIRED'
                  : 'INVALID_RESPONSE',
            });
            return;
          }
          $scope.$evalAsync(() => {
            if (!current()) return;
            pending = null;
            $scope.platformLoading = false;
            $scope.myPlatformPlaylists = response.data.playlists;
          });
        })
        .error(fail);
    };
    $scope.initPlatformController = (user) => {
      $scope.tab = platformSourceList[0].name;
      $scope.myPlatformUser = user || {};
      $scope.loadPlatformPlaylists();
    };
    $scope.$on('myplatform:update', (event, user) =>
      $scope.initPlatformController(user)
    );
    $scope.$on('music-auth:changed', (event, { source, user }) => {
      if ($scope.myPlatformUser.platform !== source) return;
      if ($scope.myPlatformUser.user_id !== user.user_id || !user.is_login)
        $scope.initPlatformController(user.is_login ? user : {});
      else $scope.myPlatformUser = user;
    });
    $scope.changeTab = (name) => {
      $scope.tab = name;
      $scope.loadPlatformPlaylists();
    };
    $scope.$on('$destroy', () => {
      destroyed = true;
      cancel();
    });
  },
]);
