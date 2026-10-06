/**
 * 文件职责：初始化翻译资源和 AngularJS 应用，注册通知、分页、拖放、窗口操作及播放进度等共享指令。
 *
 * 文件级定义：
 * - sourceList：页面可选音乐来源的名称和显示文字列表。
 * - main：在翻译资源准备后初始化 AngularJS 模块，配置页面 URL 白名单并注册共享指令和通知。
 */
/* global l1Player RequestTask */
/* global angular isElectron i18next i18nextHttpBackend Notyf notyf */
/* global setPrototypeOfLocalStorage  */

/* eslint-disable no-unused-vars */
/* eslint-disable no-param-reassign */

/**
 * sourceList：页面可选音乐来源的名称和显示文字列表；类型为 Array。
 * @type {Array}
 */
const sourceList = [
  {
    name: 'netease',
    displayId: '_NETEASE_MUSIC',
  },
  {
    name: 'qq',
    displayId: '_QQ_MUSIC',
  },
  {
    name: 'kugou',
    displayId: '_KUGOU_MUSIC',
  },
  {
    name: 'kuwo',
    displayId: '_KUWO_MUSIC',
  },
  {
    name: 'bilibili',
    displayId: '_BILIBILI_MUSIC',
  },
  {
    name: 'migu',
    displayId: '_MIGU_MUSIC',
  },
  {
    name: 'taihe',
    displayId: '_TAIHE_MUSIC',
  },
];

/**
 * 在翻译资源准备后初始化 AngularJS 模块，配置页面 URL 白名单并注册共享指令和通知。
 * 无参数。
 * @returns {void} 无返回值。
 */
const main = () => {
  const app = angular.module('listenone', []);
  setPrototypeOfLocalStorage();
  app.config([
    '$compileProvider',
    /**
     * 进入此回调后，执行 $compileProvider.imgSrcSanitizationWhitelist。
     * @param $compileProvider 配置图片地址白名单的 Angular 编译服务提供者；使用 imgSrcSanitizationWhitelist 字段。
     * @returns {void} 无返回值。
     */
    ($compileProvider) => {
      $compileProvider.imgSrcSanitizationWhitelist(
        /^\s*(https?|ftp|mailto|chrome-extension|moz-extension|file):/
      );
    },
  ]);

  app.run([
    '$rootScope',
    /**
     * 进入此回调后，更新 window.notyf、window.notyf.warning、window.notyf.info，执行 RequestTask.setNotifier。
     * @param $rootScope 应用根作用域；使用 $evalAsync 字段。
     * @returns {void} 无返回值。
     */
    ($rootScope) => {
      RequestTask.setNotifier(
        /**
         * 进入此回调后，执行 $rootScope.$evalAsync。
         * 无参数。
         * @returns {*} $rootScope.$evalAsync 的调用结果。
         */
        () => $rootScope.$evalAsync()
      );
      window.notyf = new Notyf({
        duration: 5000,
        ripple: true,
        position: { x: 'center', y: 'top' },
        types: [
          {
            type: 'warning',
            background: 'darkorange',
            icon: false,
          },
          {
            type: 'info',
            background: 'deepskyblue',
            icon: false,
          },
          {
            type: 'success',
            className: 'notyf__toast--success',
            backgroundColor: '#335eea',
            icon: { className: 'notyf__icon--success', tagName: 'i' },
          },
          {
            type: 'error',
            className: 'notyf__toast--error',
            backgroundColor: '#b90b2c',
            icon: { className: 'notyf__icon--error', tagName: 'i' },
          },
        ],
      });
      /**
       * 关闭可替换的旧通知后显示警告消息。
       * @param msg 播放器消息或通知内容。
       * @param replace 是否替换已经显示的通知。
       * @returns {void} 无返回值。
       */
      window.notyf.warning = (msg, replace) => {
        if (replace) {
          notyf.dismissAll();
        }
        window.notyf.open({
          type: 'warning',
          message: msg,
        });
      };
      /**
       * 关闭可替换的旧通知后显示信息消息。
       * @param msg 播放器消息或通知内容。
       * @param replace 是否替换已经显示的通知。
       * @returns {void} 无返回值。
       */
      window.notyf.info = (msg, replace) => {
        if (replace) {
          notyf.dismissAll();
        }
        window.notyf.open({
          type: 'info',
          message: msg,
        });
      };
    },
  ]);

  l1Player.injectDirectives(app);

  app.filter(
    'playmode_title',
    /**
     * 构造模板过滤器，将输入转换为页面显示值。
     * 无参数。
     * @returns {Function} 供后续调用的函数。
     */
    () =>
      /**
       * 进入此回调后，取得 "顺序"。
       * @param input 待校验或转换的输入值。
       * @returns {string} "顺序"；其他分支返回 "随机"；其他分支返回 "单曲循环"；其他分支返回 ""。
       */
      (input) => {
        switch (input) {
          case 0:
            return '顺序';
          case 1:
            return '随机';
          case 2:
            return '单曲循环';
          default:
            return '';
        }
      }
  );

  app.directive(
    'customOnChange',
    /**
     * 构造 customOnChange 指令定义，将模板元素连接到相应页面或播放器操作。
     * 无参数。
     * @returns {Object} ret。
     */
    () => {
      const ret = {
        restrict: 'A',
        /**
         * 链接当前指令的作用域和 DOM，执行 scope.$eval。
         * @param scope 当前指令的 Angular 作用域；使用 $eval 字段。
         * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
         * @param attrs 指令所在元素的属性集合；使用 customOnChange 字段。
         * @returns {void} 无返回值。
         */
        link: (scope, element, attrs) => {
          const onChangeHandler = scope.$eval(attrs.customOnChange);
          element.bind('change', onChangeHandler);
        },
      };
      return ret;
    }
  );

  app.directive(
    'volumeWheel',
    /**
     * 构造 volumeWheel 指令定义，将模板元素连接到相应页面或播放器操作。
     * 无参数。
     * @returns {Function} 供后续调用的函数。
     */
    () =>
      /**
       * 进入此回调后，执行 element.bind（"mousewheel"）。
       * @param scope 当前指令的 Angular 作用域；当前函数体未使用，保留调用签名。
       * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
       * @param attrs 指令所在元素的属性集合；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      (scope, element, attrs) => {
        element.bind(
          'mousewheel',
          /**
           * 响应 "mousewheel" 事件，执行 l1Player.adjustVolume。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            l1Player.adjustVolume(window.event.wheelDelta > 0);
          }
        );
      }
  );

  app.directive(
    'searchStatus',
    /**
     * 构造 searchStatus 指令定义，将模板元素连接到相应页面或播放器操作。
     * 无参数。
     * @returns {Object} 包含 restrict、template 的对象。
     */
    () => ({
      restrict: 'E',
      template: `<div class="search-status" role="status" aria-live="polite">
      <p ng-if="searchError">{{searchErrorMessage}}</p>
      <span ng-repeat="source in searchSources track by source.name" style="display:inline-block; margin:4px 12px 4px 0">{{source.label}}: {{source.message}}<span ng-if="source.count"> ({{source.count}})</span></span>
    </div>`,
    })
  );

  app.directive(
    'pagination',
    /**
     * 构造 pagination 指令定义，将模板元素连接到相应页面或播放器操作。
     * 无参数。
     * @returns {Object} 包含 restrict、replace、template 的对象。
     */
    () => ({
      restrict: 'EA',
      replace: false,
      template: ` <button class="btn btn-sm btn-pagination" ng-click="previousPage()" ng-disabled="curpage<=1 || loading"> {{_PREVIOUS_PAGE}}</button>
    <label> {{curpage}}<span ng-if="totalpage !== null"> / {{totalpage}}</span> </label>
    <button class="btn btn-sm btn-pagination" ng-click="nextPage()" ng-disabled="!hasMore || loading"> {{_NEXT_PAGE}}</button>`,
    })
  );

  app.directive(
    'errSrc',
    /**
     * 构造 errSrc 指令定义，将模板元素连接到相应页面或播放器操作。
     * 无参数。
     * @returns {Object} 包含 link 的对象。
     */
    () => ({
      // https://stackoverflow.com/questions/16310298/if-a-ngsrc-path-resolves-to-a-404-is-there-a-way-to-fallback-to-a-default
      /**
       * 链接当前指令的作用域和 DOM，执行 element.bind（"error"）。
       * @param scope 当前指令的 Angular 作用域；当前函数体未使用，保留调用签名。
       * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
       * @param attrs 指令所在元素的属性集合；使用 src、errSrc、$set、$observe 字段。
       * @returns {void} 无返回值。
       */
      link: (scope, element, attrs) => {
        element.bind(
          'error',
          /**
           * 响应 "error" 事件，执行 attrs.$set（"src"）。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            if (attrs.src !== attrs.errSrc) {
              attrs.$set('src', attrs.errSrc);
            }
          }
        );
        attrs.$observe(
          'ngSrc',
          /**
           * 进入此回调后，执行 attrs.$set（"src"）。
           * @param value 待检查或转换的输入值。
           * @returns {void} 无返回值。
           */
          (value) => {
            if (!value && attrs.errSrc) {
              attrs.$set('src', attrs.errSrc);
            }
          }
        );
      },
    })
  );

  app.directive(
    'resize',
    /**
     * 构造 resize 指令定义，将模板元素连接到相应页面或播放器操作。
     * @param $window Angular 注入的浏览器 window 服务。
     * @returns {Function} 供后续调用的函数。
     */
    ($window) =>
      /**
       * 进入此回调后，执行 angular.element。
       * @param scope 当前指令的 Angular 作用域；当前函数体未使用，保留调用签名。
       * @param element 指令绑定的元素或待滚动节点；使用 css 字段。
       * @returns {void} 无返回值。
       */
      (scope, element) => {
        const w = angular.element($window);
        /**
         * 根据窗口高度和页面头尾尺寸更新滚动容器高度。
         * 无参数。
         * @returns {void} 无返回值。
         */
        const changeHeight = () => {
          const headerHeight = 90;
          const footerHeight = 90;
          element.css(
            'height',
            `${w.height() - headerHeight - footerHeight}px`
          );
        };
        w.bind(
          'resize',
          /**
           * 响应 "resize" 事件，执行 changeHeight。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            changeHeight(); // 窗口尺寸变化时更新容器高度。
          }
        );
        changeHeight(); // 页面初次链接时计算高度。
      }
  );

  app.directive('addAndPlay', [
    /**
     * 构造 addAndPlay 指令定义，将模板元素连接到相应页面或播放器操作。
     * 无参数。
     * @returns {Object} 包含 restrict、scope、link 的对象。
     */
    () => ({
      restrict: 'EA',
      scope: {
        song: '=addAndPlay',
      },
      /**
       * 链接当前指令的作用域和 DOM，执行 element.bind（"click"）。
       * @param scope 当前指令的 Angular 作用域；使用 song 字段。
       * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
       * @param attrs 指令所在元素的属性集合；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      link(scope, element, attrs) {
        element.bind(
          'click',
          /**
           * 响应 "click" 事件，执行 l1Player.addTrack。
           * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
           * @returns {void} 无返回值。
           */
          (event) => {
            l1Player.addTrack(scope.song);
            l1Player.playById(scope.song.id);
          }
        );
      },
    }),
  ]);

  app.directive('addWithoutPlay', [
    /**
     * 构造 addWithoutPlay 指令定义，将模板元素连接到相应页面或播放器操作。
     * 无参数。
     * @returns {Object} 包含 restrict、scope、link 的对象。
     */
    () => ({
      restrict: 'EA',
      scope: {
        song: '=addWithoutPlay',
      },
      /**
       * 链接当前指令的作用域和 DOM，执行 element.bind（"click"）。
       * @param scope 当前指令的 Angular 作用域；使用 song 字段。
       * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
       * @param attrs 指令所在元素的属性集合；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      link(scope, element, attrs) {
        element.bind(
          'click',
          /**
           * 响应 "click" 事件，执行 l1Player.addTrack。
           * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
           * @returns {void} 无返回值。
           */
          (event) => {
            l1Player.addTrack(scope.song);
            notyf.success(i18next.t('_ADD_TO_QUEUE_SUCCESS'));
          }
        );
      },
    }),
  ]);

  app.directive('openUrl', [
    '$window',
    /**
     * 构造 openUrl 指令定义，将模板元素连接到相应页面或播放器操作。
     * @param $window Angular 注入的浏览器 window 服务；使用 open 字段。
     * @returns {Object} 包含 restrict、scope、link 的对象。
     */
    ($window) => ({
      restrict: 'EA',
      scope: {
        url: '=openUrl',
      },
      /**
       * 链接当前指令的作用域和 DOM，执行 element.bind（"click"）。
       * @param scope 当前指令的 Angular 作用域；使用 url 字段。
       * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
       * @param attrs 指令所在元素的属性集合；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      link(scope, element, attrs) {
        element.bind(
          'click',
          /**
           * 响应 "click" 事件，执行 isElectron。
           * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
           * @returns {void} 无返回值。
           */
          (event) => {
            if (isElectron()) {
              window.listen1Desktop.openExternal(scope.url);
            } else {
              $window.open(scope.url, '_blank');
            }
          }
        );
      },
    }),
  ]);

  app.directive('windowControl', [
    '$window',
    /**
     * 构造 windowControl 指令定义，将模板元素连接到相应页面或播放器操作。
     * @param $window Angular 注入的浏览器 window 服务；当前函数体未使用，保留调用签名。
     * @returns {Object} 包含 restrict、scope、link 的对象。
     */
    ($window) => ({
      restrict: 'EA',
      scope: {
        action: '@windowControl',
      },
      /**
       * 链接当前指令的作用域和 DOM，执行 element.bind（"click"）。
       * @param scope 当前指令的 Angular 作用域；使用 action 字段。
       * @param element 指令绑定的元素或待滚动节点；使用 bind 字段。
       * @param attrs 指令所在元素的属性集合；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      link(scope, element, attrs) {
        element.bind(
          'click',
          /**
           * 响应 "click" 事件，执行 isElectron。
           * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
           * @returns {void} 无返回值。
           */
          (event) => {
            if (isElectron()) {
              window.listen1Desktop.control(scope.action);
            }
          }
        );
      },
    }),
  ]);

  app.directive('infiniteScroll', [
    '$window',
    '$rootScope',
    /**
     * 构造 infiniteScroll 指令定义，将模板元素连接到相应页面或播放器操作。
     * @param $window Angular 注入的浏览器 window 服务；当前函数体未使用，保留调用签名。
     * @param $rootScope 应用根作用域；使用 $broadcast 字段。
     * @returns {Object} 包含 restrict、scope、link 的对象。
     */
    ($window, $rootScope) => ({
      restrict: 'EA',
      scope: {
        infiniteScroll: '&',
        contentSelector: '=contentSelector',
      },
      /**
       * 链接当前指令的作用域和 DOM，执行 elements.bind（"scroll"）。
       * @param scope 当前指令的 Angular 作用域；使用 loading、contentSelector 字段。
       * @param elements 指令绑定的元素集合；使用 bind 字段。
       * @param attrs 指令所在元素的属性集合；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      link(scope, elements, attrs) {
        elements.bind(
          'scroll',
          /**
           * 响应 "scroll" 事件，执行 document.querySelector。
           * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
           * @returns {void} 无返回值。
           */
          (event) => {
            if (scope.loading) {
              return;
            }
            const containerElement = elements[0];
            const contentElement = document.querySelector(
              scope.contentSelector
            );

            const baseTop = containerElement.getBoundingClientRect().top;
            const currentTop = contentElement.getBoundingClientRect().top;
            const baseHeight = containerElement.offsetHeight;
            const offset = baseTop - currentTop;

            const bottom = offset + baseHeight;
            const height = contentElement.offsetHeight;

            const remain = height - bottom;
            if (remain < 0) {
              // 页面未显示时不触发加载。
              return;
            }
            const offsetToload = 10;
            if (remain <= offsetToload) {
              $rootScope.$broadcast('infinite_scroll:hit_bottom', '');
            }
          }
        );
      },
    }),
  ]);

  /* 歌单和曲目拖放支持。 */
  app.directive('dragDropZone', [
    '$window',
    /**
     * 构造 dragDropZone 指令定义，将模板元素连接到相应页面或播放器操作。
     * @param $window Angular 注入的浏览器 window 服务；当前函数体未使用，保留调用签名。
     * @returns {Object} 包含 restrict、scope、link 的对象。
     */
    ($window) => ({
      restrict: 'A',
      scope: {
        dragobject: '=dragZoneObject',
        dragtitle: '=dragZoneTitle',
        dragtype: '=dragZoneType',
        ondrop: '&dropZoneOndrop',
        ondragleave: '&dropZoneOndragleave',
        sortable: '=',
      },
      /**
       * 链接当前指令的作用域和 DOM，执行 element.on（"dragstart"）。
       * @param scope 当前指令的 Angular 作用域；使用 dragobject、dragtype、dragtitle、ondragleave、sortable、ondrop 字段。
       * @param element 指令绑定的元素或待滚动节点；使用 on 字段。
       * @param attrs 指令所在元素的属性集合；当前函数体未使用，保留调用签名。
       * @returns {void} 无返回值。
       */
      link(scope, element, attrs) {
        // 自定义 MIME 类型区分歌单移动与曲目复制，
        // 两类操作可共用指令而不混淆数据。
        // https://stackoverflow.com/questions/34200023/drag-drop-set-custom-html-as-drag-image
        element.on(
          'dragstart',
          /**
           * 响应 "dragstart" 事件，更新 elem.id、elem.innerHTML、elem.style.position、elem.style.top，执行 ev.dataTransfer.setData。
           * @param ev 当前拖放事件对象；使用 dataTransfer 字段。
           * @returns {void} 无返回值。
           */
          (ev) => {
            if (scope.dragobject === undefined) {
              return;
            }
            if (scope.dragtype === undefined) {
              return;
            }
            ev.dataTransfer.setData(
              scope.dragtype,
              JSON.stringify(scope.dragobject)
            );
            const elem = document.createElement('div');
            elem.id = 'drag-ghost';
            elem.innerHTML = scope.dragtitle;
            elem.style.position = 'absolute';
            elem.style.top = '-1000px';
            elem.style.padding = '3px';
            elem.style.background = '#eeeeee';
            elem.style.color = '#333';
            elem.style['border-radius'] = '3px';

            document.body.appendChild(elem);
            ev.dataTransfer.setDragImage(elem, 0, 40);
          }
        );
        element.on(
          'dragend',
          /**
           * 响应 "dragend" 事件，执行 ghost.parentNode.removeChild。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            const ghost = document.getElementById('drag-ghost');
            if (ghost.parentNode) {
              ghost.parentNode.removeChild(ghost);
            }
          }
        );
        element.on(
          'dragenter',
          /**
           * 响应 "dragenter" 事件，更新 [dragType]，执行 element[0].classList.add（"dragover"）。
           * @param event 触发当前处理器的事件对象；使用 dataTransfer 字段。
           * @returns {void} 无返回值。
           */
          (event) => {
            let dragType = '';
            if (event.dataTransfer.types.length > 0) {
              [dragType] = event.dataTransfer.types;
            }
            if (
              scope.dragtype === 'application/listen1-myplaylist' &&
              dragType === 'application/listen1-song'
            ) {
              element[0].classList.add('dragover');
            }
          }
        );
        element.on(
          'dragleave',
          /**
           * 响应 "dragleave" 事件，更新 target.style['z-index']、target.style['border-bottom']、target.style['border-top']，执行 element[0].classList.remove（"dragover"）。
           * @param event 触发当前处理器的事件对象；当前函数体未使用，保留调用签名。
           * @returns {void} 无返回值。
           */
          (event) => {
            element[0].classList.remove('dragover');
            if (scope.ondragleave !== undefined) {
              scope.ondragleave();
            }
            if (scope.sortable) {
              const target = element[0];
              target.style['z-index'] = '0';
              target.style['border-bottom'] = 'solid 2px transparent';
              target.style['border-top'] = 'solid 2px transparent';
            }
          }
        );

        element.on(
          'dragover',
          /**
           * 响应 "dragover" 事件，更新 [dragType]、event.dataTransfer.dropEffect、target.style['border-bottom']、target.style['border-top']，执行 event.preventDefault。
           * @param event 触发当前处理器的事件对象；使用 preventDefault、dataTransfer、target、clientY 字段。
           * @returns {void} 无返回值。
           */
          (event) => {
            event.preventDefault();
            const dragLineColor = '#FF4444';
            let dragType = '';
            if (event.dataTransfer.types.length > 0) {
              [dragType] = event.dataTransfer.types;
            }

            if (scope.dragtype === dragType && scope.sortable) {
              event.dataTransfer.dropEffect = 'move';
              const bounding = event.target.getBoundingClientRect();
              const offset = bounding.y + bounding.height / 2;

              const direction = event.clientY - offset > 0 ? 'bottom' : 'top';
              const target = element[0];
              if (direction === 'bottom') {
                target.style['border-bottom'] = `solid 2px ${dragLineColor}`;
                target.style['border-top'] = 'solid 2px transparent';
                target.style['z-index'] = '9';
              } else if (direction === 'top') {
                target.style['border-top'] = `solid 2px ${dragLineColor}`;
                target.style['border-bottom'] = 'solid 2px transparent';
                target.style['z-index'] = '9';
              }
            } else if (
              scope.dragtype === 'application/listen1-myplaylist' &&
              dragType === 'application/listen1-song'
            ) {
              event.dataTransfer.dropEffect = 'copy';
            }
          }
        );

        element.on(
          'drop',
          /**
           * 响应 "drop" 事件，更新 target.style['border-top']、target.style['border-bottom']，执行 element[0].classList.remove（"dragover"）。
           * @param event 触发当前处理器的事件对象；使用 dataTransfer、target、clientY 字段。
           * @returns {void} 无返回值。
           */
          (event) => {
            if (scope.ondrop === undefined) {
              return;
            }
            const [dragType] = event.dataTransfer.types;
            const jsonString = event.dataTransfer.getData(dragType);
            const data = JSON.parse(jsonString);
            const bounding = event.target.getBoundingClientRect();
            const offset = bounding.y + bounding.height / 2;
            const direction = event.clientY - offset > 0 ? 'bottom' : 'top';
            // https://stackoverflow.com/questions/19889615/can-an-angular-directive-pass-arguments-to-functions-in-expressions-specified-in
            scope.ondrop({ arg1: data, arg2: dragType, arg3: direction });

            element[0].classList.remove('dragover');
            if (scope.sortable) {
              const target = element[0];
              target.style['border-top'] = 'solid 2px transparent';
              target.style['border-bottom'] = 'solid 2px transparent';
            }
          }
        );
      },
    }),
  ]);

  app.directive('draggableBar', [
    '$document',
    '$rootScope',
    /**
     * 构造 draggableBar 指令定义，将模板元素连接到相应页面或播放器操作。
     * @param $document Angular 封装的 document 服务，用于绑定或移除拖动事件；使用 off、on 字段。
     * @param $rootScope 应用根作用域；使用 $broadcast 字段。
     * @returns {Function} 供后续调用的函数。
     */
    ($document, $rootScope) =>
      /**
       * 进入此回调后，执行 element.on（"mousedown"）。
       * @param scope 当前指令的 Angular 作用域；当前函数体未使用，保留调用签名。
       * @param element 指令绑定的元素或待滚动节点；使用 on 字段。
       * @param attrs 指令所在元素的属性集合；使用 id 字段。
       * @returns {void} 无返回值。
       */
      (scope, element, attrs) => {
        let x;
        let container;
        const { mode } = attrs;

        /**
         * 开始拖动进度条并暂停自动进度刷新。
         * 无参数。
         * @returns {void} 无返回值。
         */
        function onMyMousedown() {
          if (mode === 'play') {
            $rootScope.$broadcast('dragbar:changing_progress', true);
          }
        }

        /**
         * 结束进度拖动并恢复页面刷新。
         * 无参数。
         * @returns {void} 无返回值。
         */
        function onMyMouseup() {
          if (mode === 'play') {
            $rootScope.$broadcast('dragbar:changing_progress', false);
          }
        }

        /**
         * 将拖动比例即时反映到进度或音量界面。
         * @param progress 0 至 1 的拖动比例。
         * @returns {void} 无返回值。
         */
        function onMyUpdateProgress(progress) {
          if (mode === 'play') {
            $rootScope.$broadcast('dragbar:myprogress', progress * 100);
          }
          if (mode === 'volume') {
            l1Player.setVolume(progress * 100);
            l1Player.unmute();
          }
        }

        /**
         * 提交最终播放比例，或把音量比例转换为百分比并持久化。
         * @param progress 0 至 1 的拖动比例。
         * @returns {void} 无返回值。
         */
        function onMyCommitProgress(progress) {
          // 拖动进度统一为 0 至 1；播放接口直接使用该比例，
          // 音量则换算为页面和存储采用的 0 至 100 百分比。
          if (mode === 'play') {
            l1Player.seek(progress);
          }
          if (mode === 'volume') {
            const current = localStorage.getObject('player-settings');
            current.volume = progress * 100;
            localStorage.setObject('player-settings', current);
          }
        }

        /**
         * 把当前比例交给进度条的提交处理器。
         * @param progress 0 至 1 的拖动比例。
         * @returns {void} 无返回值。
         */
        function commitProgress(progress) {
          onMyCommitProgress(progress);
        }

        /**
         * 按鼠标相对条形区域的位置计算并限制 0 至 1 的比例。
         * 无参数。
         * @returns {void} 无返回值。
         */
        function updateProgress() {
          if (container) {
            if (x < 0) {
              x = 0;
            } else if (x > container.right - container.left) {
              x = container.right - container.left;
            }
          }
          const progress = x / (container.right - container.left);
          onMyUpdateProgress(progress);
        }

        /**
         * 拖动时更新鼠标位置并刷新进度比例。
         * @param event 触发当前处理器的事件对象；使用 clientX 字段。
         * @returns {void} 无返回值。
         */
        function mousemove(event) {
          x = event.clientX - container.left;
          updateProgress();
        }

        /**
         * 提交最终比例并移除文档级拖动监听。
         * 无参数。
         * @returns {void} 无返回值。
         */
        function mouseup() {
          const progress = x / (container.right - container.left);
          commitProgress(progress);
          $document.off('mousemove', mousemove);
          $document.off('mouseup', mouseup);
          onMyMouseup();
        }

        element.on(
          'mousedown',
          /**
           * 响应 "mousedown" 事件，更新 container、x，执行 onMyMousedown。
           * @param event 触发当前处理器的事件对象；使用 preventDefault、clientX 字段。
           * @returns {void} 无返回值。
           */
          (event) => {
            onMyMousedown();
            container = document
              .getElementById(attrs.id)
              .getBoundingClientRect();
            // 阻止浏览器拖动选中的页面内容。
            event.preventDefault();
            x = event.clientX - container.left;
            updateProgress();
            $document.on('mousemove', mousemove);
            $document.on('mouseup', mouseup);
          }
        );
      },
  ]);
};

i18next.use(i18nextHttpBackend).init({
  lng: 'zh-CN',
  fallbackLng: 'zh-CN',
  supportedLngs: ['zh-CN', 'zh-TC', 'en-US', 'fr-FR', 'ko-KR', 'pt-BR'],
  preload: ['zh-CN', 'zh-TC', 'en-US', 'fr-FR', 'ko-KR', 'pt-BR'],
  debug: false,
  backend: {
    loadPath: 'i18n/{{lng}}.json',
  },
});

main();
