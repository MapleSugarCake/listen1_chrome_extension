/**
 * 文件职责：提供个人平台歌单分类并注册控制器，根据当前平台和用户读取创建、收藏及推荐歌单。
 *
 * 文件级定义：
 * - platformSourceList：个人平台歌单的创建、收藏和推荐分类列表。
 */
/* global angular MediaService */
/**
 * platformSourceList：个人平台歌单的创建、收藏和推荐分类列表；类型为 Array。
 * @type {Array}
 */
const platformSourceList = [
  {
    name: 'my_created_playlist',
    displayId: '_MY_CREATED_PLAYLIST',
  },
  {
    name: 'my_favorite_playlist',
    displayId: '_MY_FAVORITE_PLAYLIST',
  },
  {
    name: 'recommend_playlist',
    displayId: '_RECOMMEND_PLAYLIST',
  },
];
angular.module('listenone').controller('PlatformController', [
  '$scope',
  /**
   * 初始化 PlatformController 控制器，绑定模板使用的作用域状态和操作。
   * @param $scope 当前控制器作用域；使用 myPlatformPlaylists、myPlatformUser、platformSourceList、tab、loadPlatformPlaylists、initPlatformController、$on、changeTab 字段。
   * @returns {void} 无返回值。
   */
  ($scope) => {
    $scope.myPlatformPlaylists = [];
    $scope.myPlatformUser = {};
    $scope.platformSourceList = platformSourceList;
    $scope.tab = platformSourceList[0].name;

    /**
     * 根据当前用户和分类请求创建、收藏或推荐歌单。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.loadPlatformPlaylists = () => {
      if ($scope.myPlatformUser.platform === undefined) {
        return;
      }
      let getPlaylistFn = MediaService.getUserCreatedPlaylist;
      if ($scope.tab === 'recommend_playlist') {
        getPlaylistFn = MediaService.getRecommendPlaylist;
      } else if ($scope.tab === 'my_favorite_playlist') {
        getPlaylistFn = MediaService.getUserFavoritePlaylist;
      }
      const user = $scope.myPlatformUser;
      getPlaylistFn(user.platform, {
        user_id: user.user_id,
      }).success(
        /**
         * 进入此回调后，更新 $scope.myPlatformPlaylists。
         * @param response 异步请求返回的响应对象。
         * @returns {void} 无返回值。
         */
        (response) => {
        const { data } = response;
        $scope.myPlatformPlaylists = data.playlists;
      });
    };

    /**
     * 保存当前平台用户并初始化分类数据。
     * @param user 平台登录用户资料。
     * @returns {void} 无返回值。
     */
    $scope.initPlatformController = (user) => {
      $scope.tab = platformSourceList[0].name;
      $scope.myPlatformUser = user;
      $scope.loadPlatformPlaylists();
    };

    $scope.$on('myplatform:update',
      /**
       * 响应 "myplatform:update" 事件，执行 $scope.initPlatformController。
       * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
       * @param user 平台登录用户资料。
       * @returns {void} 无返回值。
       */
      (event, user) => {
      $scope.initPlatformController(user);
    });

    /**
     * 切换个人平台歌单分类并重新加载。
     * @param name 待查找或注册的名称。
     * @returns {void} 无返回值。
     */
    $scope.changeTab = (name) => {
      $scope.tab = name;
      $scope.loadPlatformPlaylists();
    };
  },
]);
