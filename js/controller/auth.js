/**
 * 文件职责：注册认证控制器，将各平台用户状态映射到页面，处理登录入口与退出后的状态刷新。
 *
 * 本文件没有需要逐项列出的文件级定义。
 */
/* global angular MediaService isElectron */
angular.module('listenone').controller('AuthController', [
  '$scope',
  /**
   * 初始化 AuthController 控制器，绑定模板使用的作用域状态和操作。
   * @param $scope 当前控制器作用域。
   * @returns {void} 无返回值。
   */
  ($scope) => {
    $scope.loginProgress = false;
    $scope.loginType = 'email';
    $scope.loginSourceList = MediaService.getLoginProviders().map(
      /**
       * 转换 MediaService.getLoginProviders() 中的条目，i.name。
       * @param i 来自 MediaService.getLoginProviders() 的当前条目；使用 name 字段。
       * @returns {*} i.name。
       */
      (i) => i.name
    );
    /**
     * 逐个查询可登录来源的用户状态并更新页面。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.refreshAuthStatus = () => {
      $scope.loginSourceList.map(
        /**
         * 转换 $scope.loginSourceList 中的条目，MediaService.getUser().success 的调用结果。
         * @param source 来自 $scope.loginSourceList 的当前条目。
         * @returns {*} MediaService.getUser().success 的调用结果。
         */
        (source) =>
          MediaService.getUser(source).success(
            /**
             * 进入此回调后，执行 $scope.setMusicAuth。
             * @param data 本次处理或转发的业务数据；使用 status、data 字段。
             * @returns {void} 无返回值。
             */
            (data) => {
              if (data.status === 'success') {
                $scope.setMusicAuth(source, data.data);
              } else {
                $scope.setMusicAuth(source, {});
              }
            }
          )
      );
    };

    /**
     * 退出指定来源并重新查询登录状态。
     * @param source 音乐来源名称。
     * @returns {void} 无返回值。
     */
    $scope.logout = (source) => {
      $scope.setMusicAuth(source, {});
      MediaService.logout(source);
    };

    /**
     * 检查来源是否存在已登录的用户数据。
     * @param source 音乐来源名称。
     * @returns {*} $scope.musicAuth[source] 且 $scope.musicAuth[source].is_login。
     */
    $scope.is_login = (source) =>
      $scope.musicAuth[source] && $scope.musicAuth[source].is_login;

    $scope.musicAuth = {};

    /**
     * 保存指定来源的用户认证数据。
     * @param source 音乐来源名称。
     * @param data 本次处理或转发的业务数据。
     * @returns {void} 无返回值。
     */
    $scope.setMusicAuth = (source, data) => {
      $scope.musicAuth[source] = data;
    };

    /**
     * 取得来源的登录入口地址。
     * @param source 音乐来源名称。
     * @returns {*} MediaService.getLoginUrl 的调用结果。
     */
    $scope.getLoginUrl = (source) => MediaService.getLoginUrl(source);

    /**
     * 按桌面或浏览器环境打开指定来源的登录页。
     * @param source 音乐来源名称。
     * @returns {*} window.listen1Desktop.openLogin 的调用结果；其他分支返回 window.open 的调用结果。
     */
    $scope.openLogin = (source) => {
      const url = $scope.getLoginUrl(source);
      if (isElectron()) {
        return window.listen1Desktop.openLogin(url);
      }
      return window.open(url, '_blank');
    };
  },
]);
