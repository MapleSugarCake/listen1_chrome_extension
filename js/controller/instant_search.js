/* global angular i18next MediaService sourceList */
angular.module('listenone').controller('InstantSearchController', [
  '$scope',
  '$timeout',
  '$rootScope',
  ($scope, $timeout, $rootScope) => {
    $scope.sourceList = sourceList.filter((item) => item.searchable !== false);
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
    const pageKey = () =>
      `${$scope.keywords}:${$scope.tab}:${$scope.searchType}`;
    function cancel() {
      generation += 1;
      if (pending?.cancel) pending.cancel();
      pending = null;
    }
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
      const render = (data, final) => {
        if (request !== generation) return;
        $scope.$evalAsync(() => {
          if (request !== generation) return;
          $scope.result = data.result.map((track) => ({
            ...track,
            sourceName: i18next.t(track.source),
          }));
          $scope.searchSources = Object.entries(data.sources || {}).map(
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
        });
      };
      pending = MediaService.search($scope.tab, {
        keywords: $scope.keywords,
        curpage: $scope.curpage,
        type: $scope.searchType,
      });
      pending.success((data) => render(data, true));
      if (pending.onProgress) pending.onProgress((data) => render(data, false));
      if (pending.error)
        pending.error((error) => {
          if (request !== generation || error.code === 'CANCELLED') return;
          $scope.$evalAsync(() => {
            if (request !== generation) return;
            $scope.loading = false;
            $scope.searchError = error.code;
            $scope.searchErrorMessage = i18next.t(`_ERROR_${error.code}`);
          });
        });
      document.querySelector('.site-wrapper-innerd')?.scrollTo({ top: 0 });
    }
    $scope.changeSourceTab = (tab) => {
      pages.set(pageKey(), $scope.curpage);
      $scope.tab = tab;
      $scope.curpage = pages.get(pageKey()) || 1;
      performSearch();
    };
    $scope.changeSearchType = (type) => {
      $scope.searchType = type;
      $scope.curpage = 1;
      performSearch();
    };
    $scope.isActiveTab = (tab) => $scope.tab === tab;
    $scope.isSearchType = (type) => $scope.searchType === type;
    $scope.$watch('keywords', () => {
      pages.clear();
      $scope.curpage = 1;
      performSearch();
    });
    $scope.enterEvent = (event) => {
      if (event.key === 'Enter' || event.keyCode === 13) {
        $scope.curpage = 1;
        performSearch();
      }
    };
    $scope.nextPage = () => {
      if (!$scope.hasMore || $scope.loading) return;
      $scope.curpage += 1;
      performSearch();
    };
    $scope.previousPage = () => {
      if ($scope.curpage <= 1 || $scope.loading) return;
      $scope.curpage -= 1;
      performSearch();
    };
    $scope.$on('$destroy', cancel);
  },
]);
