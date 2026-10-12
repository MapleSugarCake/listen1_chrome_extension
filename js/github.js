/**
 * 文件职责：封装 GitHub 授权与 Gist 备份，将本地播放器设置序列化为备份文件并支持读取和恢复。
 *
 * 文件级定义：
 * - github：创建 GitHub 授权和 Gist 备份服务，闭包保存状态及请求配置。
 */
/* global isElectron */

/**
 * 创建 GitHub 授权和 Gist 备份服务，闭包保存状态及请求配置。
 * 无参数。
 * @returns {Object} 包含 GitHub 授权及 Gist 备份操作的服务对象。
 */
function github() {
  if (isElectron())
    window.listen1Desktop.on(
      'githubOAuthCode',
      /**
       * 响应 "githubOAuthCode" 事件，执行 window.GithubClient.github.handleCallback。
       * @param code 授权页返回的临时授权码。
       * @returns {*} window.GithubClient.github.handleCallback 的调用结果。
       */
      (code) => window.GithubClient.github.handleCallback(code)
    );
  const OAUTH_URL = 'https://github.com/login/oauth';
  const API_URL = 'https://api.github.com';
  const repositoryUrl = isElectron()
    ? 'https://github.com/MapleSugarCake/listen1_maple_desktop'
    : 'https://github.com/MapleSugarCake/listen1_maple_extension';

  const client_id = 'e099a4803bb1e2e773a3';
  const client_secret = '81fbfc45c65af8c0fbf2b4dae6f23f22e656cfb8';

  const GithubAPI = axios.create({
    baseURL: API_URL,
    headers: { accept: 'application/json' },
  });
  GithubAPI.interceptors.request.use(
    /**
     * 进入此回调后，更新 config.headers.Authorization，执行 localStorage.getObject（"githubOauthAccessKey"）。
     * @param config 本次请求或设置的配置对象；使用 headers 字段。
     * @returns {*} config。
     */
    (config) => {
      const accessToken = localStorage.getObject('githubOauthAccessKey');
      // eslint-disable-next-line no-param-reassign
      config.headers.Authorization = `token ${accessToken}`;
      return config;
    }
  );

  const Github = {
    status: 0,
    username: '',
  };

  window.GithubClient = {
    github: {
      /**
       * 以授权码换取访问令牌并保存，随后刷新授权状态。
       * @param code 授权页返回的临时授权码。
       * @param cb 通知当前异步子任务完成的回调。
       * @returns {void} 无返回值。
       */
      handleCallback: (code, cb) => {
        const url = `${OAUTH_URL}/access_token`;
        const params = {
          client_id,
          client_secret,
          code,
        };
        axios
          .post(url, '', {
            params,
            headers: { accept: 'application/json' },
          })
          .then(
            /**
             * 上一步异步操作完成后，调用 cb，依次传入 ak。
             * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
             * @returns {void} 无返回值。
             */
            (res) => {
              const ak = res.data.access_token;
              if (ak)
                localStorage.setItem(
                  'githubOauthAccessKey',
                  JSON.stringify(ak)
                );
              if (cb !== undefined) {
                cb(ak);
              }
            }
          );
      },
      /**
       * 按桌面或扩展环境打开 GitHub 授权地址。
       * 无参数。
       * @returns {void} 无返回值。
       */
      openAuthUrl: () => {
        Github.status = 1;
        const url = `${OAUTH_URL}/authorize?client_id=${client_id}&scope=gist`;
        if (isElectron()) {
          window.listen1Desktop.openLogin(url);
          return;
        }
        window.open(url, '_blank');
      },
      /**
       * 读取闭包中的 GitHub 授权状态。
       * 无参数。
       * @returns {*} Github.status。
       */
      getStatus: () => Github.status,
      /**
       * 将授权状态转换为页面显示文字。
       * 无参数。
       * @returns {string} "未连接"；其他分支返回 "连接中"；其他分支返回 按当前字段拼接的字符串；其他分支返回 "???"。
       */
      getStatusText: () => {
        switch (Github.status) {
          case 0:
            return '未连接';
          case 1:
            return '连接中';
          case 2:
            return `${Github.username}已登录`;
          default:
            return '???';
        }
      },
      /**
       * 查询当前 GitHub 用户，更新状态并通知可选回调。
       * @param callback 完成当前操作后调用的回调。
       * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
       */
      updateStatus: async (callback) => {
        const access_token = localStorage.getObject('githubOauthAccessKey');
        if (access_token == null) {
          Github.status = 0;
        } else {
          const { data } = await GithubAPI.get('/user');
          if (data.login === undefined) {
            Github.status = 1;
          } else {
            Github.status = 2;
            Github.username = data.login;
          }
        }
        if (callback != null) {
          callback(Github.status);
        }
      },
      /**
       * 清除访问令牌并重置授权状态。
       * 无参数。
       * @returns {void} 无返回值。
       */
      logout: () => {
        localStorage.removeItem('githubOauthAccessKey');
        Github.status = 0;
      },
    },

    gist: {
      /**
       * 将设置对象转换成 JSON 备份和歌单说明两个 Gist 文件。
       * @param jsonObject 本地设置组成的备份对象；使用 playerlists 字段。
       * @returns {Object} 整理后的结果 result。
       */
      json2gist(jsonObject) {
        const result = {};

        result['listen1_backup.json'] = {
          content: JSON.stringify(jsonObject),
        };
        // 停用代码，保留供历史对照：
        // const markdown = '# My Listen1 Playlists\n';
        const playlistIds = jsonObject.playerlists;
        const songsCount = playlistIds.reduce(
          /**
           * 归并 playlistIds 中的条目，更新 tableHeader、result[filename]，执行 playlist.tracks.reduce。
           * @param count 上一步归并得到的累计结果。
           * @param playlistId 来自 playlistIds 的当前条目。
           * @returns {*} count 加上 playlist.tracks.length。
           */
          (count, playlistId) => {
            const playlist = jsonObject[playlistId];
            const cover = `<img src="${playlist.info.cover_img_url}" width="140" height="140"><br/>`;
            const { title } = playlist.info;
            let tableHeader = '\n| 音乐标题 | 歌手 | 专辑 |\n';
            tableHeader += '| --- | --- | --- |\n';
            const tableBody = playlist.tracks.reduce(
              /**
               * 归并 playlist.tracks 中的条目，按当前字段拼接的字符串。
               * @param r 上一步归并得到的累计结果。
               * @param track 来自 playlist.tracks 的当前条目；使用 title、artist、album 字段。
               * @returns {string} 按当前字段拼接的字符串。
               */
              (r, track) =>
                `${r} | ${track.title} | ${track.artist} | ${track.album} | \n`,
              ''
            );
            const content = `<details>\n  <summary>${cover}   ${title}</summary><p>\n${tableHeader}${tableBody}</p></details>`;
            const filename = `listen1_${playlistId}.md`;
            result[filename] = {
              content,
            };
            return count + playlist.tracks.length;
          },
          0
        );
        const summary = `本歌单由[Listen1](${repositoryUrl})创建, 歌曲数：${songsCount}，歌单数：${playlistIds.length}，点击查看更多`;
        result['listen1_aha_playlist.md'] = {
          content: summary,
        };

        return result;
      },

      /**
       * 解析备份文件；内容被截断时先请求原始文件再交给回调。
       * @param gistFiles Gist 返回的文件字典。
       * @param callback 完成当前操作后调用的回调。
       * @returns {*} callback 回调的直接返回值；其他分支返回 null。
       */
      gist2json(gistFiles, callback) {
        if (!gistFiles['listen1_backup.json'].truncated) {
          const jsonString = gistFiles['listen1_backup.json'].content;
          return callback(JSON.parse(jsonString));
        }

        const url = gistFiles['listen1_backup.json'].raw_url;
        // 停用代码，保留供历史对照：
        // const { size } = gistFiles['listen1_backup.json'];
        GithubAPI.get(url).then(
          /**
           * 上一步异步操作完成后，调用 callback，依次传入 res.data。
           * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
           * @returns {*} callback 回调的直接返回值。
           */
          (res) => callback(res.data)
        );
        return null;
      },

      /**
       * 列出当前用户已有的 Listen1 Gist 备份。
       * 无参数。
       * @returns {Promise<*>} 该异步链的 Promise。
       */
      listExistBackup() {
        return GithubAPI.get('/gists').then(
          /**
           * 上一步异步操作完成后，执行 result.filter。
           * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
           * @returns {Array} 符合筛选条件的条目数组。
           */
          (res) => {
            const result = res.data;
            return result.filter(
              /**
               * 筛选检查 result 中的条目，backupObject.description.startsWith 的调用结果。
               * @param backupObject 来自 result 的当前条目；使用 description 字段。
               * @returns {*} backupObject.description.startsWith 的调用结果。
               */
              (backupObject) =>
                backupObject.description.startsWith('updated by Listen1')
            );
          }
        );
      },

      /**
       * 按是否提供 gistId 选择新建或更新备份，并保留指定公开性。
       * @param files 待上传的 Gist 文件集合。
       * @param gistId 目标 Gist 标识；新建备份时可为空。
       * @param isPublic 新建备份是否公开。
       * @returns {*} GithubAPI.request 的调用结果。
       */
      backupMySettings2Gist(files, gistId, isPublic) {
        let method;
        let url;
        if (gistId != null) {
          method = 'patch';
          url = `/gists/${gistId}`;
        } else {
          method = 'post';
          url = '/gists';
        }
        return GithubAPI.request({
          method,
          url,
          data: {
            description: `updated by Listen1(${repositoryUrl}) at ${new Date().toLocaleString()}`,
            public: isPublic,
            files,
          },
        });
      },

      /**
       * 请求指定 Gist 的文件信息，供后续备份解析与恢复。
       * @param gistId 目标 Gist 标识；新建备份时可为空。
       * @returns {Promise<*>} 该异步链的 Promise。
       */
      importMySettingsFromGist(gistId) {
        return GithubAPI.get(`/gists/${gistId}`).then(
          /**
           * 上一步异步操作完成后，取得 res.data.files。
           * @param res 异步响应或消息应答函数，按调用位置使用；使用 data 字段。
           * @returns {*} res.data.files。
           */
          (res) => res.data.files
        );
      },
    },
  };
}

github();
