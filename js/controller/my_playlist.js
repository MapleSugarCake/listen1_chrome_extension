/**
 * 文件职责：注册个人歌单控制器，响应刷新事件并读取自建和收藏歌单列表。
 *
 * 本文件没有需要逐项列出的文件级定义。
 */
/* eslint-disable no-unused-vars */
/* global angular MediaService */

angular.module('listenone').controller('MyPlayListController', [
  '$scope',
  '$timeout',
  /**
   * 初始化 MyPlayListController 控制器，绑定模板使用的作用域状态和操作。
   * @param $scope 当前控制器作用域；使用 myplaylists、favoriteplaylists、loadMyPlaylist、$evalAsync、loadFavoritePlaylist、$watch、$on 字段。
   * @param $timeout Angular 延时服务；当前函数体未使用，保留调用签名。
   * @returns {void} 无返回值。
   */
  ($scope, $timeout) => {
    $scope.myplaylists = [];
    $scope.favoriteplaylists = [];

    /**
     * 读取并更新自建歌单列表。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.loadMyPlaylist = () => {
      MediaService.showMyPlaylist().success(
        /**
         * 进入此回调后，执行 $scope.$evalAsync。
         * @param data 本次处理或转发的业务数据；使用 result 字段。
         * @returns {void} 无返回值。
         */
        (data) => {
        $scope.$evalAsync(
          /**
           * 进入此回调后，更新 $scope.myplaylists。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
          $scope.myplaylists = data.result;
        });
      });
    };

    /**
     * 读取并更新收藏歌单列表。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.loadFavoritePlaylist = () => {
      MediaService.showFavPlaylist().success(
        /**
         * 进入此回调后，执行 $scope.$evalAsync。
         * @param data 本次处理或转发的业务数据；使用 result 字段。
         * @returns {void} 无返回值。
         */
        (data) => {
        $scope.$evalAsync(
          /**
           * 进入此回调后，更新 $scope.favoriteplaylists。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
          $scope.favoriteplaylists = data.result;
        });
      });
    };

    $scope.$watch('current_tag',
      /**
       * 观察值发生变化时，更新 $scope.myplaylists，执行 $scope.loadMyPlaylist。
       * @param newValue 观察表达式本次得到的新值。
       * @param oldValue 观察表达式前一次的值。
       * @returns {void} 无返回值。
       */
      (newValue, oldValue) => {
      if (newValue !== oldValue) {
        if (newValue === '1') {
          $scope.myplaylists = [];
          $scope.loadMyPlaylist();
        }
      }
    });
    $scope.$on('myplaylist:update',
      /**
       * 响应 "myplaylist:update" 事件，执行 $scope.loadMyPlaylist。
       * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
       * @param data 本次处理或转发的业务数据；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      (event, data) => {
      $scope.loadMyPlaylist();
    });

    $scope.$on('favoriteplaylist:update',
      /**
       * 响应 "favoriteplaylist:update" 事件，执行 $scope.loadFavoritePlaylist。
       * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
       * @param data 本次处理或转发的业务数据；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      (event, data) => {
      $scope.loadFavoritePlaylist();
    });
  },
]);
