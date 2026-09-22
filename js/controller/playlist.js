/* global angular MediaService sourceList i18next notyf */
angular.module('listenone').controller('PlayListController', [
  '$scope',
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
        .success((res) =>
          $scope.$evalAsync(() => {
            if (generation !== request) return;
            const result = Array.isArray(res.result) ? res.result : [];
            $scope.result = offset ? $scope.result.concat(result) : result;
            hasMore = result.length > 0;
            $scope.loading = false;
          })
        )
        .error((error) =>
          $scope.$evalAsync(() => {
            if (generation !== request || error.code === 'CANCELLED') return;
            $scope.loading = false;
            notyf.warning(i18next.t(`_ERROR_${error.code}`));
          })
        );
    }
    $scope.$on('infinite_scroll:hit_bottom', () => {
      if (!$scope.loading && hasMore) loadPage($scope.result.length);
    });
    $scope.loadPlaylist = () => {
      $scope.showMore = false;
      hasMore = true;
      loadPage(0);
      const { tab } = $scope;
      if (!$scope.playlistFilters[tab] && !$scope.allPlaylistFilters[tab]) {
        const task = MediaService.getPlaylistFilters(tab);
        filters.add(task);
        task
          .success((res) =>
            $scope.$evalAsync(() => {
              filters.delete(task);
              $scope.playlistFilters[tab] = res.recommend;
              $scope.allPlaylistFilters[tab] = res.all;
            })
          )
          .error(() => filters.delete(task));
      }
    };
    $scope.changeTab = (tab) => {
      $scope.tab = tab;
      $scope.result = [];
      $scope.currentFilterId = '';
      $scope.loadPlaylist();
    };
    $scope.changeFilter = (filterId) => {
      $scope.result = [];
      $scope.currentFilterId = filterId;
      $scope.loadPlaylist();
    };
    $scope.toggleMorePlaylists = () => {
      $scope.showMore = !$scope.showMore;
    };
    $scope.$on('$destroy', () => {
      generation += 1;
      if (pending) pending.cancel();
      filters.forEach((task) => task.cancel());
    });
  },
]);
