/**
 * 文件职责：注册个人设置控制器，管理六种语言、四种主题、版本查询和桌面代理配置。
 *
 * 本文件没有需要逐项列出的文件级定义。
 */
/* eslint-disable no-undef */
/* eslint-disable no-param-reassign */
/* global angular i18next sourceList platformSourceList */
angular.module('listenone').controller('ProfileController', [
  '$scope',
  /**
   * 初始化 ProfileController 控制器，绑定模板使用的作用域状态和操作；在作用域销毁时执行已登记的清理处理。
   * @param $scope 当前控制器作用域。
   * @returns {void} 无返回值。
   */
  ($scope) => {
    const repository = isElectron()
      ? 'listen1_maple_desktop'
      : 'listen1_maple_extension';
    const repositoryUrl = `https://github.com/MapleSugarCake/${repository}`;
    $scope.about = {
      name: 'listen1_maple',
      email: 'maplecakeqaq@gmail.com',
      homepage: repositoryUrl,
      issues: `${repositoryUrl}/issues`,
    };
    /**
     * 仅为有效显示版本追加 Maple 标记，不改变发布版本或重复追加后缀。
     * @param version 当前版本数字或 Release 标签。
     * @returns {string} 显示版本；缺失或空标签返回空字符串。
     */
    const displayVersion = (version) => {
      if (typeof version !== 'string' || !version.trim()) return '';
      const value = version.trim();
      return value.endsWith('_maple') ? value : `${value}_maple`;
    };
    let defaultLang = 'zh-CN';
    const supportLangs = ['zh-CN', 'zh-TC', 'en-US', 'fr-FR', 'ko-KR', 'pt-BR'];
    if (supportLangs.indexOf(navigator.language) !== -1) {
      defaultLang = navigator.language;
    }
    if (supportLangs.indexOf(localStorage.getObject('language')) !== -1) {
      defaultLang = localStorage.getObject('language');
    }
    $scope.lastestVersion = '';
    $scope.currentVersion = displayVersion(isElectron() ? '2.35.1' : '2.33.0');
    $scope.theme = '';
    $scope.proxyModes = [
      { name: 'system', displayId: '_PROXY_SYSTEM' },
      { name: 'direct', displayId: '_PROXY_DIRECT' },
      { name: 'custom', displayId: '_PROXY_CUSTOM' },
    ];

    [$scope.proxyModeInput] = $scope.proxyModes;
    [$scope.proxyMode] = $scope.proxyModes;
    $scope.proxyProtocols = ['http', 'https', 'quic', 'socks4', 'socks5'];

    $scope.proxyProtocol = 'http';
    $scope.proxyRules = '';

    /**
     * 更新自定义代理输入所用协议。
     * @param newProtocol 新的自定义代理协议。
     * @returns {void} 无返回值。
     */
    $scope.changeProxyProtocol = (newProtocol) => {
      $scope.proxyProtocol = newProtocol;
    };

    /**
     * 更新代理模式选项。
     * @param newMode 新的播放环境或代理模式。
     * @returns {void} 无返回值。
     */
    $scope.changeProxyMode = (newMode) => {
      $scope.proxyModeInput = newMode;
    };

    /**
     * 将系统、直连或自定义输入转换为桌面代理配置并提交。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.setProxyConfig = () => {
      const mode = $scope.proxyModeInput.name;
      $scope.proxyMode = $scope.proxyModeInput;
      const host = document.getElementById('proxy-rules-host').value;
      const port = document.getElementById('proxy-rules-port').value;
      $scope.proxyRules = `${$scope.proxyProtocol}://${host}:${port}`;
      if (isElectron()) {
        const message = 'update_proxy_config';

        if (mode === 'system' || mode === 'direct') {
          window.listen1Desktop.control(message, { mode });
        } else {
          window.listen1Desktop.control(message, {
            proxyRules: $scope.proxyRules,
          });
        }
      }
    };

    /**
     * 向主进程请求当前代理配置，结果由事件订阅接收。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.getProxyConfig = () => {
      if (isElectron()) {
        // 从主进程请求代理配置。
        const message = 'get_proxy_config';

        window.listen1Desktop.control(message);
      }
    };

    /**
     * 查询对应桌面或扩展 fork 的最新正式版本，并读取桌面代理配置。
     * 无参数。
     * @returns {void} 无返回值。
     */
    $scope.initProfile = () => {
      const url = `https://api.github.com/repos/MapleSugarCake/${repository}/releases/latest`;
      axios
        .get(url)
        .then(
          /**
           * 上一步异步操作完成后，更新 $scope.lastestVersion。
           * @param response 异步请求返回的响应对象；使用 data 字段。
           * @returns {void} 无返回值。
           */
          (response) => {
            $scope.$evalAsync(() => {
              $scope.lastestVersion = displayVersion(response.data?.tag_name);
            });
          }
        )
        .catch(
          /**
           * 异步操作失败后，更新 $scope.lastestVersion。
           * 无参数。
           * @returns {void} 无返回值。
           */
          () => {
            $scope.$evalAsync(() => {
              $scope.lastestVersion = '';
            });
          }
        );

      $scope.getProxyConfig();
    };

    if (isElectron()) {
      $scope.$on(
        '$destroy',
        window.listen1Desktop.on(
          'proxyConfig',
          /**
           * 响应 "proxyConfig" 事件，更新 [$scope.proxyMode]、$scope.proxyModeInput、$scope.proxyRules、$scope.proxyProtocol，执行 $scope.$evalAsync。
           * @param config 本次请求或设置的配置对象；使用 mode、proxyRules 字段。
           * @returns {void} 无返回值。
           */
          (config) => {
            // 解析当前代理配置以填充表单。
            if (config.mode === 'system' || config.mode === 'direct') {
              [$scope.proxyMode] = $scope.proxyModes.filter(
                /**
                 * 筛选检查 $scope.proxyModes 中的条目，i.name 是否严格等于 config.mode。
                 * @param i 来自 $scope.proxyModes 的当前条目；使用 name 字段。
                 * @returns {boolean} i.name 是否严格等于 config.mode。
                 */
                (i) => i.name === config.mode
              );
              $scope.proxyModeInput = $scope.proxyMode;
              $scope.proxyRules = '';
            } else {
              [$scope.proxyMode] = $scope.proxyModes.filter(
                /**
                 * 筛选检查 $scope.proxyModes 中的条目，i.name 是否严格等于 "custom"。
                 * @param i 来自 $scope.proxyModes 的当前条目；使用 name 字段。
                 * @returns {boolean} i.name 是否严格等于 "custom"。
                 */
                (i) => i.name === 'custom'
              );
              $scope.proxyModeInput = $scope.proxyMode;
              $scope.proxyRules = config.proxyRules;
              // 停用代码，保留供历史对照：
              // rules = 'socks5://127.0.0.1:1080'
              const match = /^(\w+):\/\/([^/]+):(\d+)$/.exec(
                config.proxyRules || ''
              );
              if (!match) return;
              const [, protocol, host, port] = match;

              $scope.proxyProtocol = protocol;
              document.getElementById('proxy-rules-host').value = host;
              document.getElementById('proxy-rules-port').value = port;
            }
            $scope.$evalAsync();
          }
        )
      );
    }
    /**
     * 加载指定语言并将翻译键写入页面作用域，保存语言以供重启恢复。
     * @param langKey 要切换的语言代码。
     * @returns {void} 无返回值。
     */
    $scope.setLang = (langKey) => {
      // 主题切换时重新加载图标集合。
      i18next.changeLanguage(langKey).then(
        /**
         * 上一步异步操作完成后，执行 localStorage.setObject（"language"）。
         * @param t 当前条目或时间值。
         * @returns {void} 无返回值。
         */
        (t) => {
          axios.get('i18n/zh-CN.json').then(
            /**
             * 上一步异步操作完成后，执行 Object.keys().forEach。
             * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
             * @returns {void} 无返回值。
             */
            (res) => {
              Object.keys(res.data).forEach(
                /**
                 * 逐项处理 Object.keys() 中的条目，更新 $scope[key]，执行 t。
                 * @param key 来自 Object.keys() 的当前条目。
                 * @returns {void} 无返回值。
                 */
                (key) => {
                  $scope[key] = t(key);
                }
              );
              sourceList.forEach(
                /**
                 * 逐项处理 sourceList 中的条目，更新 item.displayText，执行 t。
                 * @param item 来自 sourceList 的当前条目；使用 displayText、displayId 字段。
                 * @returns {void} 无返回值。
                 */
                (item) => {
                  item.displayText = t(item.displayId);
                }
              );
              platformSourceList.forEach(
                /**
                 * 逐项处理 platformSourceList 中的条目，更新 item.displayText，执行 t。
                 * @param item 来自 platformSourceList 的当前条目；使用 displayText、displayId 字段。
                 * @returns {void} 无返回值。
                 */
                (item) => {
                  item.displayText = t(item.displayId);
                }
              );
              $scope.proxyModes.forEach(
                /**
                 * 逐项处理 $scope.proxyModes 中的条目，更新 item.displayText，执行 t。
                 * @param item 来自 $scope.proxyModes 的当前条目；使用 displayText、displayId 字段。
                 * @returns {void} 无返回值。
                 */
                (item) => {
                  item.displayText = t(item.displayId);
                }
              );
            }
          );
          localStorage.setObject('language', langKey);
        }
      );
    };
    $scope.setLang(defaultLang);

    let defaultTheme = 'white';
    if (localStorage.getObject('theme') !== null) {
      defaultTheme = localStorage.getObject('theme');
    }
    /**
     * 保存主题，替换主题和通用样式链接，并重新加载共用 SVG 图标。
     * @param theme 要启用的主题标识。
     * @returns {void} 无返回值。
     */
    $scope.setTheme = (theme) => {
      $scope.theme = theme;

      const themeFiles = {
        white: ['css/iparanoid.css', 'css/common.css'],
        black: ['css/origin.css', 'css/common.css'],
        white2: ['css/iparanoid2.css', 'css/common2.css'],
        black2: ['css/origin2.css', 'css/common2.css'],
      };
      // 主题切换时重新加载图标集合。
      if (themeFiles[theme] !== undefined) {
        const keys = ['theme-css', 'common-css'];
        for (let i = 0; i < themeFiles[theme].length; i += 1) {
          document.getElementById(keys[i]).href = themeFiles[theme][i];
        }
        localStorage.setObject('theme', theme);
      }
      axios.get('images/feather-sprite.svg').then(
        /**
         * 上一步异步操作完成后，更新 document.getElementById('feather-container').innerHTML，执行 document.getElementById（"feather-container"）。
         * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
         * @returns {void} 无返回值。
         */
        (res) => {
          document.getElementById('feather-container').innerHTML = res.data;
        }
      );
    };
    $scope.setTheme(defaultTheme);
  },
]);
