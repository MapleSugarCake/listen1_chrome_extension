/**
 * 文件职责：注册即时搜索控制器，管理平台、关键词、页码、聚合进度及请求取消，阻止过期结果覆盖新搜索。
 *
 * 本文件没有需要逐项列出的文件级定义。
 */
/* global angular i18next MediaService sourceList */
angular.module('listenone').controller('InstantSearchController', [
  '$scope',
  '$timeout',
  '$rootScope',
  /**
   * 初始化 InstantSearchController 控制器，绑定模板使用的作用域状态和操作；在作用域销毁时执行已登记的清理处理。
   * @param $scope 当前控制器作用域。
   * @param $timeout Angular 延时服务；当前函数体未使用，保留调用签名。
   * @param $rootScope 应用根作用域；使用 $broadcast 字段。
   * @returns {void} 无返回值。
   */
  ($scope, $timeout, $rootScope) => {
    $scope.sourceList = sourceList.filter(
      /**
       * 筛选检查 sourceList 中的条目，item.searchable 是否不等于 false。
       * @param item 来自 sourceList 的当前条目；使用 searchable 字段。
       * @returns {boolean} item.searchable 是否不等于 false。
       */
      (item) => item.searchable !== false
    );
    $scope.tab = sourceList[0].name;
    $scope.keywords = '';
    $scope.searchType = 0;
    $scope.curpage = 1;
    $scope.totalpage = null;
    $scope.hasMore = false;
    $scope.loading = false;
    $scope.result = [];
    $scope.searchSources = [];
    let generation = 0;
    let pending;
    const pages = new Map();
    /**
     * 按关键词、平台和搜索类型生成独立页码状态键。
     * 无参数。
     * @returns {string} 按当前字段拼接的字符串。
     */
    const pageKey = () =>
      `${$scope.keywords}:${$scope.tab}:${$scope.searchType}`;
    /**
     * 取消前一搜索任务并推进代次。
     * 无参数。
     * @returns {void} 无返回值。
     */
    function cancel() {
      generation += 1;
      if (pending?.cancel) pending.cancel();
      pending = null;
    }
    /**
     * 启动当前条件的搜索，接收分阶段进度与最终结果，并拒绝过期响应。
     * 无参数。
     * @returns {void} 无返回值。
     */
    function performSearch() {
      cancel();
      const request = generation;
      $scope.result = [];
      $scope.searchSources = [];
      $scope.searchError = null;
      $scope.searchErrorMessage = '';
      $scope.loading = !!$scope.keywords.trim();
      $scope.hasMore = false;
      $scope.totalpage = null;
      if (!$scope.loading) return;
      $rootScope.$broadcast('search:keyword_change', $scope.keywords);
      /**
       * 在 Angular 更新周期内应用当前搜索结果、来源状态与分页信息。
       * @param data 本次处理或转发的业务数据；使用 result、sources、total、pageSize、hasMore 字段。
       * @param final 是否为本轮搜索的最终结果，决定何时结束加载状态。
       * @returns {void} 无返回值。
       */
      const render = (data, final) => {
        if (request !== generation) return;
        $scope.$evalAsync(
          /**
           * 进入此回调后，更新 $scope.result、$scope.searchSources、$scope.totalpage、$scope.hasMore，执行 data.result.map。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            if (request !== generation) return;
            $scope.result = data.result.map(
              /**
               * 转换 data.result 中的条目，包含 展开字段、sourceName 的对象。
               * @param track 来自 data.result 的当前条目；使用 source 字段。
               * @returns {Object} 包含 展开字段、sourceName 的对象。
               */
              (track) => ({
                ...track,
                sourceName: i18next.t(track.source),
              })
            );
            $scope.searchSources = Object.entries(data.sources || {}).map(
              /**
               * 转换 Object.entries() 中的条目，包含 name、展开字段、label、message 的对象。
               * @param options 来自 Object.entries() 的当前条目；解构参数，包含 name（待查找或注册的名称）、status（当前操作或来源的状态值）；使用 state、code 字段。
               * @returns {Object} 包含 name、展开字段、label、message 的对象。
               */
              ([name, status]) => ({
                name,
                ...status,
                label: i18next.t(name),
                message: i18next.t(
                  status.state === 'error'
                    ? `_ERROR_${status.code}`
                    : `_SEARCH_${status.state.toUpperCase()}`
                ),
              })
            );
            $scope.totalpage = Number.isFinite(data.total)
              ? Math.max(1, Math.ceil(data.total / (data.pageSize || 20)))
              : null;
            $scope.hasMore =
              data.hasMore ??
              ($scope.totalpage !== null && $scope.curpage < $scope.totalpage);
            if (final) $scope.loading = false;
          }
        );
      };
      pending = MediaService.search($scope.tab, {
        keywords: $scope.keywords,
        curpage: $scope.curpage,
        type: $scope.searchType,
      });
      pending.success(
        /**
         * 进入此回调后，执行 render。
         * @param data 本次处理或转发的业务数据。
         * @returns {*} render 的调用结果。
         */
        (data) => render(data, true)
      );
      if (pending.onProgress)
        pending.onProgress(
          /**
           * 进入此回调后，执行 render。
           * @param data 本次处理或转发的业务数据。
           * @returns {*} render 的调用结果。
           */
          (data) => render(data, false)
        );
      if (pending.error)
        pending.error(
          /**
           * 进入此回调后，执行 $scope.$evalAsync。
           * @param error 被捕获或传入的异常；使用 code 字段。
           * @returns {void} 无返回值。
           */
          (error) => {
            if (request !== generation || error.code === 'CANCELLED') return;
            $scope.$evalAsync(
              /**
               * 进入此回调后，更新 $scope.loading、$scope.searchError、$scope.searchErrorMessage，执行 i18next.t。
               * 无参数。
               * @returns {void} 无返回值。
               */
              () => {
                if (request !== generation) return;
                $scope.loading = false;
                $scope.searchError = error.code;
                $scope.searchErrorMessage = i18next.t(`_ERROR_${error.code}`);
              }
            );
          }
        );
      document.querySelector('.site-wrapper-innerd')?.scrollTo({ top: 0 });
    }
    /**
     * 切换来源后恢复对应页码并重新搜索。
     * @param tab 要切换的平台或分类。
     * @returns {void} 无返回值。
     */
    $scope.changeSourceTab = (tab) => {
      pages.set(pageKey(), $scope.curpage);
      $scope.tab = tab;
      $scope.curpage = pages.get(pageKey()) || 1;
      performSearch();
    };
    /**
     * 切换单曲或歌单搜索并重新请求。
     * @param type 当前查询或操作类型。
     * @returns {void} 无返回值。
     */
    $scope.changeSearchType = (type) => {
      $scope.searchType = type;
      $scope.curpage = 1;
      performSearch();
    };
    /**
     * 判断给定来源是否为当前搜索来源。
     * @param tab 要切换的平台或分类。
     * @returns {boolean} $scope.tab 是否严格等于 tab。
     */
    $scope.isActiveTab = (tab) => $scope.tab === tab;
    /**
     * 判断给定搜索类型是否已选中。
     * @param type 当前查询或操作类型。
     * @returns {boolean} $scope.searchType 是否严格等于 type。
     */
    $scope.isSearchType = (type) => $scope.searchType === type;
    $scope.$watch(
      'keywords',
      /**
       * 观察值发生变化时，更新 $scope.curpage，执行 pages.clear。
       * 无参数。
       * @returns {void} 无返回值。
       */
      () => {
        pages.clear();
        $scope.curpage = 1;
        performSearch();
      }
    );
    /**
     * 在回车时触发即时搜索。
     * @param event 触发当前处理器的事件对象；使用 key、keyCode 字段。
     * @returns {void} 无返回值。
     */
    $scope.enterEvent = (event) => {
      if (event.key === 'Enter' || event.keyCode === 13) {
        $scope.curpage = 1;
        performSearch();
      }
    };
    /**
     * 仅在存在下一页时增加页码并搜索。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.nextPage = () => {
      if (!$scope.hasMore || $scope.loading) return;
      $scope.curpage += 1;
      performSearch();
    };
    /**
     * 仅在页码大于一时返回上一页。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.previousPage = () => {
      if ($scope.curpage <= 1 || $scope.loading) return;
      $scope.curpage -= 1;
      performSearch();
    };
    $scope.$on('$destroy', cancel);
  },
]);
