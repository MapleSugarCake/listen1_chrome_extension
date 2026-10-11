/**
 * 文件职责：注册热门歌单控制器，按平台和筛选条件分页加载，取消过期任务并在销毁时清理监听。
 *
 * 本文件没有需要逐项列出的文件级定义。
 */
/* global angular MediaService sourceList i18next notyf */
angular.module('listenone').controller('PlayListController', [
  '$scope',
  /**
   * 初始化 PlayListController 控制器，绑定模板使用的作用域状态和操作；在作用域销毁时执行已登记的清理处理。
   * @param $scope 当前控制器作用域。
   * @returns {void} 无返回值。
   */
  ($scope) => {
    $scope.result = [];
    $scope.tab = sourceList[0].name;
    $scope.sourceList = sourceList;
    $scope.playlistFilters = {};
    $scope.allPlaylistFilters = {};
    $scope.currentFilterId = '';
    $scope.loading = false;
    $scope.showMore = false;
    let generation = 0;
    let pending;
    let hasMore = true;
    const filters = new Set();
    /**
     * 按偏移请求当前平台和分类的歌单，取消旧任务并用代次保护结果。
     * @param offset 从列表开头跳过的条目数量。
     * @returns {void} 无返回值。
     */
    function loadPage(offset) {
      generation += 1;
      const request = generation;
      if (pending) pending.cancel();
      $scope.loading = true;
      pending = MediaService.showPlaylistArray(
        $scope.tab,
        offset,
        $scope.currentFilterId
      );
      pending
        .success(
          /**
           * 进入此回调后，执行 $scope.$evalAsync。
           * @param res 异步响应或消息应答函数，按调用位置使用；使用 result 字段。
           * @returns {*} $scope.$evalAsync 的调用结果。
           */
          (res) =>
            $scope.$evalAsync(
              /**
               * 进入此回调后，更新 $scope.result、hasMore、$scope.loading，执行 Array.isArray。
               * 无参数。
               * @returns {void} 无返回值。
               */
              () => {
                if (generation !== request) return;
                const result = Array.isArray(res.result) ? res.result : [];
                $scope.result = offset ? $scope.result.concat(result) : result;
                hasMore = result.length > 0;
                $scope.loading = false;
              }
            )
        )
        .error(
          /**
           * 进入此回调后，执行 $scope.$evalAsync。
           * @param error 被捕获或传入的异常；使用 code 字段。
           * @returns {*} $scope.$evalAsync 的调用结果。
           */
          (error) =>
            $scope.$evalAsync(
              /**
               * 进入此回调后，更新 $scope.loading，执行 notyf.warning。
               * 无参数。
               * @returns {void} 无返回值。
               */
              () => {
                if (generation !== request || error.code === 'CANCELLED')
                  return;
                $scope.loading = false;
                notyf.warning(i18next.t(`_ERROR_${error.code}`));
              }
            )
        );
    }
    $scope.$on(
      'infinite_scroll:hit_bottom',
      /**
       * 响应 "infinite_scroll:hit_bottom" 事件，执行 loadPage。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        if (!$scope.loading && hasMore) loadPage($scope.result.length);
      }
    );
    /**
     * 重新加载首屏歌单，并在需要时读取来源筛选分类。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.loadPlaylist = () => {
      $scope.showMore = false;
      hasMore = true;
      loadPage(0);
      const { tab } = $scope;
      if (!$scope.playlistFilters[tab] && !$scope.allPlaylistFilters[tab]) {
        const task = MediaService.getPlaylistFilters(tab);
        filters.add(task);
        task
          .success(
            /**
             * 进入此回调后，执行 $scope.$evalAsync。
             * @param res 异步响应或消息应答函数，按调用位置使用；使用 recommend、all 字段。
             * @returns {*} $scope.$evalAsync 的调用结果。
             */
            (res) =>
              $scope.$evalAsync(
                /**
                 * 进入此回调后，更新 $scope.playlistFilters[tab]、$scope.allPlaylistFilters[tab]，执行 filters.delete。
                 * 无参数。
                 * @returns {void} 无返回值。
                 */
                () => {
                  filters.delete(task);
                  $scope.playlistFilters[tab] = res.recommend;
                  $scope.allPlaylistFilters[tab] = res.all;
                }
              )
          )
          .error(
            /**
             * 进入此回调后，执行 filters.delete。
             * 无参数。
             * @returns {*} filters.delete 的调用结果。
             */
            () => filters.delete(task)
          );
      }
    };
    /**
     * 切换平台、重置偏移和筛选后加载。
     * @param tab 要切换的平台或分类。
     * @returns {void} 无返回值。
     */
    $scope.changeTab = (tab) => {
      $scope.tab = tab;
      $scope.result = [];
      $scope.currentFilterId = '';
      $scope.loadPlaylist();
    };
    /**
     * 切换分类并重新加载首屏。
     * @param filterId 歌单分类标识。
     * @returns {void} 无返回值。
     */
    $scope.changeFilter = (filterId) => {
      $scope.result = [];
      $scope.currentFilterId = filterId;
      $scope.loadPlaylist();
    };
    /**
     * 展开或收起完整分类列表。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.toggleMorePlaylists = () => {
      $scope.showMore = !$scope.showMore;
    };
    $scope.$on(
      '$destroy',
      /**
       * 响应 "$destroy" 事件，更新 generation，执行 pending.cancel。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        generation += 1;
        if (pending) pending.cancel();
        filters.forEach(
          /**
           * 逐项处理 filters 中的条目，task.cancel 的调用结果。
           * @param task 来自 filters 的当前条目；使用 cancel 字段。
           * @returns {*} task.cancel 的调用结果。
           */
          (task) => task.cancel()
        );
      }
    );
  },
]);
