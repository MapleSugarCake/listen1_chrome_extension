# Listen 1 共享播放器：架构与维护指南

本文适用于共享播放器仓库及子目录。作为桌面子模块时另读[桌面指南](../../AGENTS.md)；独立检出时外层文件不存在。第 1～6 节描述当前实现，第 7 节是 AI 操作规则。桌面上的成功不能证明浏览器扩展或全部线上服务可用。

## 1. 运行架构与入口

应用保留 AngularJS `listenone`、静态 HTML/JS/CSS 和两套布局，没有独立业务服务器。`listen1.html` 依次加载 vendor、`request.js`、工具/provider、bridge、播放核心、MediaService、播放门面及控制器；全局脚本依赖加载顺序，不是 ESM 自动解析。

```text
controller → MediaService（路由/聚合/换源）→ provider（参数/数据转换）
                                               └→ RequestTask / Axios
controller → l1Player → bridge → threadPlayer / Howler
                                    └→ BG_PLAYER:* → UI / 持久化
```

`request.js` 管理超时、取消、错误归类及 Axios 公共拦截器；`app.js` 用 `$evalAsync` 进入 Angular 更新周期，不修改 Axios 内部原型。桌面通过 `window.listen1Desktop` 接入系统能力，页面没有 Node/remote。扩展保留 Chrome API 分支；Chrome manifest V3、Firefox manifest V2 和旧后台页 bridge 的兼容性需要独立浏览器验证。桌面的 `player_thread.js` 实际运行在主页面，不是 Worker。

## 2. 目录与依赖

| 路径                                               | 职责                                                     |
| -------------------------------------------------- | -------------------------------------------------------- |
| `listen1.html`、`js/app.js`                        | 两套模板、全局指令、翻译和页面更新                       |
| `js/controller/`                                   | 搜索、歌单、导航/备份、播放、认证、设置                  |
| `js/request.js`、`js/loweb.js`                     | 请求任务与 MediaService 门面                             |
| `js/provider/`                                     | 平台和本地音乐数据转换                                   |
| `js/l1_player.js`、`bridge.js`、`player_thread.js` | 播放命令、环境桥接、队列和 Howler 状态                   |
| `js/myplaylist.js`、`lowebutil.js`                 | 歌单存储、Cookie 适配、JSON 容错                         |
| `js/lyrics.js`、`track_management.js`              | 共享 LRC/替换存储、桌面歌曲信息及歌词管理指令            |
| `js/track_details.js`、`css/visual-polish.css`     | 桌面歌曲详情、封面恢复、短期音频信息缓存及跨主题视觉打磨 |
| `js/github.js`、`lastfm.js`                        | OAuth/Gist 和 Last.fm，真实账号流程需单独验证            |
| `js/background.js`、`oauth_callback.js`、manifest  | 扩展入口与回调                                           |
| `js/vendor/`、`vendor/`                            | 静态库、版本/来源/许可/哈希及保留项                      |
| `css/`、`images/`、`fonts/`、`i18n/`               | 样式、图片字体、六份翻译                                 |
| `scripts/`、`test/`、`config/`                     | vendor 生成、行为测试、迁移后保留的 ESLint 规则          |

仓库和开发包名称为 `listen1_maple_extension`，作为桌面子模块时保留 `app/listen1_chrome_extension` 目录。本包依赖均位于 devDependencies，其中包含生成静态库所需的精确版本。正常启动不依赖 node_modules 或在线 CDN。`vendor:check` 比较实际文件、许可证、版本和哈希，定制 forge 单独保留并检验原始哈希；详见 [vendor 指南](vendor/README.md)。包元数据 `main: index.js` 不是实际启动入口。

## 3. 业务调用关系

| 功能                   | 入口                                                                         |
| ---------------------- | ---------------------------------------------------------------------------- |
| 单平台/聚合搜索、分页  | InstantSearchController → MediaService.search → provider.search              |
| 精选/分类与歌单详情    | PlayListController / NavigationController → MediaService                     |
| 自建/收藏/排序/合并    | MyPlayListController / NavigationController → myplaylist                     |
| 播放、切歌和队列       | PlayController / 指令 → l1Player → threadPlayer                              |
| 自动换源               | threadPlayer → MediaService.bootstrapTrack → 搜索与地址解析                  |
| 歌词和桌面歌词         | PlayController → getLyric；桌面桥接转发原文/翻译                             |
| 本地导入               | NavigationController → listen1Desktop.importLocalMusic → localmusic          |
| 平台账号/歌单          | AuthController / PlatformController → provider / Cookie 适配                 |
| JSON/Gist              | NavigationController / GithubClient                                          |
| 设置、主题、语言、代理 | ProfileController；桌面与扩展分别查询对应 MapleSugarCake fork 的正式 Release |

## 4. 请求、数据与播放约定

Provider 路由依赖原有前缀：netease `ne`、qq `qq`、kugou `kg`、kuwo `kw`、bilibili `bi`、migu `mg`、taihe `th`；xiami `xm`、localmusic `lm`、myplaylist `my` 是隐藏服务。隐藏不是 UI 能力声明，保留历史 provider 不等于在线验证。注册入口 `PROVIDERS` 和页面 `sourceList` 要一起检查。

### 4.1 请求任务

MediaService 保留 `.success(fn)`，相关网络入口补充 `.error(fn)`、`.cancel()`、`.promise`；搜索还支持 `.onProgress(fn)`。旧 provider 的 `{ success(fn, failure) }` 通过 `RequestTask.legacy` 包装。`bootstrap_track(track, success, failure, { signal })` 保留回调并接收取消信号。内部 `/search?...` 等 URL 是参数载体，不是本地业务服务器。

`MediaService.getLyric(trackId, albumId, lyricUrl, translatedUrl, options)` 的第五参数可选；桌面默认读取有效替换，`{ original: true }` 绕过替换并调用原 provider，保持原四参数及 RequestTask 协议。歌词管理只请求用户选择的候选，聚合默认搜索全部七个可见来源；仅接受有效同步正文，候选与文件必须先预览再应用。Bilibili 的原 provider 返回空歌词，不能据搜索结果宣称歌词可用。

推荐歌单同样返回 RequestTask，不具备对应能力的来源返回 `UNSUPPORTED`。网易账号及创建、收藏、推荐歌单请求将任务的 AbortSignal 传给 Axios，校验业务码和必要结构；业务码 200 且 `account:null` 表示正常未登录，缺失结构返回 `INVALID_RESPONSE`。账号查询失败保留上一成功数据并显示状态未确认；确认游客、退出或切换账号会清理对应歌单。账号与歌单控制器在刷新、分类切换及销毁时取消任务，并用请求代次拒绝迟到响应。隔离登录窗口和手动登录完成确认保持不变。

单平台歌曲与歌单搜索在 MediaService 对当前页按 `source:id` 稳定去重，保留首次记录和顺序；未知总数时用去重前的响应长度判断下一页，已知总数、页大小和显式 `hasMore` 保持原有语义。诊断只记录来源、阶段、固定接口名、错误码及数值型 HTTP/业务码、重复数量，不展开响应、账号、凭据或回跳 URL。

单请求默认 15 秒；单曲原平台及自动换源总预算 30 秒。HTTP、业务错误、认证、限流、网络、资源不可用和格式异常分开处理，取消不弹失败提示。聚合搜索按到达顺序追加并按来源/ID 去重，保留已显示顺序，发布各来源状态，慢平台有终止机制。搜索控制器保持 500ms 输入防抖，并对关键词、平台、类型、页码使用代次检查和取消。列表/歌词也拦截旧请求，避免跨页面或跨曲目覆盖。

| 数据     | 约定                                                                                           |
| -------- | ---------------------------------------------------------------------------------------------- |
| 搜索     | `{ result, total, pageSize, hasMore, type }`；未知 total 为 null，不伪造 1,000；聚合附 sources |
| 曲目     | 原有 id/title/artist/album/source 等字段，ID 和 source 用于路由                                |
| 歌单     | `{ info, tracks }`；外部歌单 LRU 100 项、TTL 一小时，本地歌单不缓存                            |
| 歌词     | `{ lyric, tlyric }`，缺少时间轴时不编造同步信息                                                |
| 地址解析 | `{ url, bitrate, platform }`，platform 记录实际播放来源                                        |

换源保留开关和同标题/歌手匹配限制，默认候选 `kuwo`、`qq`、`migu`，首个成功来源胜出并取消其他候选；全部失败明确结束。本地文件不自动换源。媒体 URL 只缓存于内存，5 分钟过期，加载失败会清理地址并最多重新解析一次。

### 4.2 播放命令与事件

`l1Player` 是 UI 命令边界，`BG_PLAYER:*` 是状态边界；前台 bridge 的订阅返回取消函数。READY、LOAD、PLAYLIST、FRAME_UPDATE、PLAY_STATE、VOLUME/MUTE 和 RETRIEVE_URL/PLAY_FAILED 的消费方要同步维护。曲目身份和播放请求代次防止旧地址、歌词及 Howler 回调影响当前歌曲。

队列按 ID 去重，批量入队只发一次队列快照和必要 LOAD；清空/删除当前项会取消解析并卸载 Howler。快照去掉 howl，不能持久化实例。`l1Player` 音量是 0～100，核心是 0～1；UI 播放模式 0/1/2 对应 all/shuffle/one。

桌面本地信息编辑经 `localmusic.update_track` 更新本地库、自建歌单和持久队列，再调用 `l1Player.updateTrackMetadata` 更新核心；只允许显示字段，保持 ID、来源、音频实例、播放位置与状态。编辑歌名去除首尾空白后不能为空，歌手/专辑可为空并同步派生 ID；本地歌手/专辑名包含下划线及查询特殊字符时仍按完整值查找。新本地导入跳过既有 ID，不批量重命名旧记录。

显示字段白名单包括 `img_url`、`cover_asset_id` 和 `cover_file_name`。封面经桌面层选择及暂存，确认时先事务式更新本地库、自建/收藏歌单和 `current-playing`，失败回滚旧快照；提交后保留副本、同步核心及 `track:metadata`。`TrackPresentation` 按副本 UUID 恢复文件 URL，迟到解析复核 ID/副本身份，不写入原音频。旧记录缺少新增字段按原封面显示。

`l1Player.getResolvedAudioSource(trackId)` 返回核心保存的实际已加载音源快照或未过期地址，不触发播放。`BG_PLAYER:AUDIO_SOURCE` 发布 `{ id, identity }`；实际来源变化使详情缓存失效。未加载歌曲的详情手动查询沿用 `MediaService.bootstrapTrack` 的换源规则，但不入队、不修改 Howler。信息缓存最多 128 项、TTL 五分钟且仅本次页面运行有效；按 ID、实际来源及音源身份绑定，不持久化媒体 URL。

桌面音量均衡默认关闭，使用 `loudness.js` 的 100 ms RMS 有效片段平均电平，`normalized_audio.js` 的完整资产准备与 AudioBuffer 播放。`standard` 最多 1 dB 声道联动限峰，`dynamic` 仅固定增益；共同目标仅在本次运行中下调。主音量在均衡后，音量／静音不能改变测量和均衡增益。`BG_PLAYER:LOUDNESS` 发布关闭、等待、分析中、生效、未均衡或失败状态；临时读取失败重试一次后暂停，明确不可处理才回退。分析、播放实例和测量缓存不进入曲目快照；代次／曲目／实际地址／模式使迟到结果失效。术语见 [GLOSSARY](GLOSSARY.md)。

## 5. 持久化与界面

两套关于页面共享 ProfileController 的 `about` 信息，名称为 `listen1_maple`、邮箱为 `maplecakeqaq@gmail.com`；桌面主页、Issue 和最新版查询使用 `MapleSugarCake/listen1_maple_desktop`，扩展使用 `MapleSugarCake/listen1_maple_extension`。当前与最新版只在显示时追加一次 `_maple`，版本数字、manifest、安装身份和 OAuth 回调保持原规则；原作者与设计者署名保留。无正式 Release、请求失败或缺失标签时隐藏最新版一行，不查询上游兜底。

保留 playerlists、favoriteplayerlists、各歌单 ID、`lmplaylist_reserve`、`current-playing`、`player-settings`、theme/language/openSidebar、enable_*、auto_choose_source_list 和 float_window_setting 等键。损坏 JSON 返回空值供调用方兜底，不清空原存储；恢复队列过滤无效项。本地 ID 仍为 `lmtrack_` 加原路径，文件 URL 由桌面层编码。

桌面歌词替换使用独立键 `lyric-override:${trackId}`，每首只存当前 `{ lyric, tlyric, offsetMs }`，原歌词可只存 `{ offsetMs }`，旧记录缺少偏移按 0 读取。同 ID 跨歌单共享，同名不同 ID 独立；损坏记录回退原 provider，不删除其他数据。现有 JSON/Gist 遍历自然包含新键，原曲目 lyrics 不改写。无有效独立译文时明确写 `tlyric: ''`。应用一次写入内容及零偏移；恢复先获取原 provider，成功后删除替换和偏移，失败提供重试并保留旧结果。写入失败不发布成功事件，保留旧版本。

替换记录兼容可选 `provenance: { kind, fileName?, platform? }`。文件导入保存实际选择文件名，候选替换保存实际 provider 平台；`Lyrics` 验证来源字段并短期记住原 provider 来源。旧替换记录无来源时留空，内嵌/JSON 歌词无确切文件名时留空。恢复成功才删除替换来源，失败保留内容与来源；音频换源不能覆盖歌词平台。

`Lyrics.parse` 使用毫秒时间线、translationFlag 和排序后的 lineNumber；允许 BOM、LF/CRLF、元数据、空行、无小数或 1～3 位小数时间戳及一行多时间戳。手动文件额外严格校验正文并报告错误行；空同步正文不能应用。`getOffset/setOffset` 使用整数毫秒，步长 300、范围 ±60000；PlayController 以播放毫秒 ≥ 时间戳＋偏移选行，原文/译文及悬浮窗同步，不改写 LRC 或音频位置。偏移保存后发布 `lyrics:offset-changed(trackId)`，暂停时立即刷新当前帧，不请求歌词。单份临时已加载歌词快照用于当前歌词可用性检查，不进入备份。

`trackManager` 位于布局分支之上，固定目标快照，包含导入、恢复及可展开的时间对齐；遮罩只有在其上按下、松开且未拖动才关闭。独立 `lyricSearchPage` 接入两套导航的 tag 7，返回恢复入口和滚动位置；现代布局的管理入口放在现有播放操作栏。歌曲条目操作横向排列，在行悬停或键盘聚焦时显示。`LyricSearchSession` 在主题分支外保留目标、各平台页码及已完成搜索缓存；输入防抖 500ms，回车立即搜索，平台切换只筛选缓存，分页补齐未缓存页，各来源错误独立重试。候选只预览，明确应用后仍留在页面。搜索/预览/同步正文检查各有请求代次，关闭、离开及主题销毁取消在途请求，回调与 `$evalAsync` 内均复核。内容保存后发布 `lyrics:changed(trackId)`，PlayController 取消旧请求并强制刷新当前 ID，原文/译文始终成对转发。

两套模板的列表、搜索结果和队列由 `trackActions` 提供 `info` 歌曲详情入口，点击、Enter/Space 阻止行播放事件；播放栏不放详情入口。共享 `trackDetails` 弹窗依次显示歌名、歌手、专辑、封面文件名、歌词文件名、音质、编码、时长、本地路径与文件名、大小，网络歌曲末尾追加歌词平台。缺失字段留空，长文本换行且可复制，歌名沿用按钮的原生 title 提示。网络音频须点击读取，桌面解析上限 8 MiB、总预算 15 秒；关闭、主题/目标/实际音源变化取消请求，并在异步完成及 Angular 更新内部复核目标和代次。

`loudness-settings` 独立保存 `{ enabled, mode }`，避免旧控制器保存 `player-settings` 时覆盖均衡设置。RMS 摘要最多 128 个，仅在本次页面运行中保留；解码缓冲仅保留当前资产。两套布局使用同一个 `loudness-control` 指令，按钮在 `volume-wheel` 容器之外；图标为实心三滑杆，默认跟随同栏颜色，启用使用主题强调色。鼠标离开弹窗及控制区整组 200 毫秒后关闭，现代布局恢复时长；组内往返取消关闭，原生模式选择框打开时暂缓关闭。键盘焦点显现控制区，Tab 离组关闭，Esc 关闭并回到按钮；鼠标点击留下的焦点不阻止收起。主题重建从核心获取真实状态，销毁时清理计时器及状态、鼠标、焦点、键盘、外部点击和语言订阅。浏览器扩展保持默认 Howler 行为，此次桌面专用桥不暴露给扩展。

JSON 备份遍历 localStorage，恢复按键合并，不先清空；Gist 只显式排除部分键，不保证脱敏。新生成的 Gist 摘要和描述链接按桌面／扩展环境指向对应 fork，保留 `updated by Listen1` 识别前缀及既有备份文件名。认证键如 githubOauthAccessKey、lastfmtoken、lastfmsession 的实际值不能进入日志或测试。备份不包含原音频、electron-store 或完整 Cookie。

封面副本位于桌面 userData 的 `covers`，JSON/Gist 仅含 UUID 和原文件名等引用；跨设备恢复需同时迁移该目录。既有音频、歌曲/歌单 ID 和存储键不迁移。

| 主题   | 主题 CSS / 公共 CSS          |
| ------ | ---------------------------- |
| white  | iparanoid.css / common.css   |
| black  | origin.css / common.css      |
| white2 | iparanoid2.css / common2.css |
| black2 | origin2.css / common2.css    |

`visual-polish.css` 在主题及公共 CSS 之后加载，保留主题变量、经典布局描边 1.5/现代布局描边 2。歌词管理复用 Feather `align-right`，详情复用 `info`，几何与用户提供 SVG 一致；作用域内显式设置 currentColor、fill:none 和图标尺寸以避免公共 span/SVG 样式干扰。现代收起侧栏宽 60px、图标禁止缩小、文字不占位；自建和收藏歌单显示封面缩略图并在缺失或加载失败时回退默认封面。导航和拖放入口保留。

两套 ng-if 模板都会销毁和重建控制器；播放快捷键和订阅必须随作用域移除，不能误删新实例的快捷键。翻译支持 zh-CN、zh-TC、en-US、fr-FR、ko-KR、pt-BR 的加载和恢复，zh-CN 回退。新增键同步六份资源和两套 UI；资源存在不是视觉和菜单完整性证明。

## 6. 开发与验证

使用 Node 24.21.0 / npm 12.0.2，精确版本和锁文件见 package.json。ESLint 10 flat config 以 `config/legacy-rules.json` 显式保留原有效规则，import-x 替代旧 import 插件，移除不兼容 Airbnb preset。Prettier 3 使用本目录单引号配置。

```sh
npm ci
npm test
npm run lint
npm run vendor:check
```

`npm test` 运行 Node 行为测试，桌面集成与在线播放测试在外层仓库；本子模块没有 start 脚本。`format:check` 的全仓 glob 可能报告既有格式差异，不包含 HTML；只格式化改动文件，不运行全仓 format。Husky 9 通过 `LISTEN1_INSTALL_HOOKS=1 npm run prepare` 显式安装，默认安装不改父仓库 Git hook。CI 安装后运行 lint、行为测试和 vendor 校验，Node 24.21.0；本轮未触发远程 CI。

按影响测试完整链路：provider 搜索/分页/空结果/错误/地址解析、实际音频输出、播放控制、队列清空和乱序回调、换源失败、歌词、旧数据、四主题和语言恢复。静态通过、单模块正常或搜索结果不能替代播放验收。扩展在独立副本中测试，Firefox manifest 替换不要覆盖主工作区。应用包版本为 2.35.1，扩展 manifest/旧 README 版本差异保留；更新包版本不代表已打包或正式发布。

## 7. AI 操作规则

以下是本文件制定的维护规则，不等同于已经由 CI 强制执行的规则。

1. **先核对仓库和现状。** 查看本仓库状态、相关调用链、配置和文档；作为子模块时也查看父仓库状态。保留已有修改，以工作区为事实基线，不自动清理、切换或更新子模块版本。当前任务授权的操作不需要因文档惯例重复请求确认。
2. **遵守加载和环境边界。** 修改脚本依赖时检查 HTML 顺序、全局声明和入口初始化；不只添加文件而遗漏加载。桌面能力通过 `window.listen1Desktop`，IPC、文件访问保留 `isElectron()` 边界，不在页面重新引入 Node。不要把现有脚本自动改成模块导入或框架迁移。
3. **从业务调用方维护 provider。** 平台变更联查 `PROVIDERS`、页面 `sourceList`、HTML 加载、权限和请求头处理。保持已有 ID 前缀、`source`、回调及返回数据的兼容性；确需调整接口时同步全部使用方并说明旧数据影响。不要为一次平台故障盲目扩大通用请求规则。
4. **保持播放状态链路一致。** UI 操作优先使用现有 `l1Player` 入口，状态通过现有事件同步；修改事件时联查 bridge、发送方、门面和控制器。不要把 Howler 实例或临时媒体 URL 当成持久化业务数据。异步状态更新要检查 Angular digest，避免请求完成但界面不更新。
5. **维护数据兼容性。** 更改歌曲/歌单字段、存储键、排序或备份格式时，检查旧队列和旧歌单读取；说明是否需要迁移及如何保留数据。不得通过清空用户 localStorage、Cookie 或备份来掩盖兼容问题；不得在日志、示例和测试数据中复制真实令牌或备份。
6. **核对两套模板与翻译。** 共享界面改动检查传统/现代两套布局及对应公共样式。新增用户可见文本使用现有翻译机制，核对中文键、相关语言资源和两套菜单；不要仅依据某份资源文件宣称语言功能完整。
7. **遵守本目录工具配置。** JavaScript 使用本地 Prettier/ESLint 规则，不套用外层双引号配置。只修正任务涉及的文件；不要为局部修改运行全量 `npm run format`，或扩大 ESLint 禁用范围来绕过新问题。更新 vendor 或依赖时说明来源、版本和实际加载位置，保留现有许可信息，并核查正确的锁文件。
8. **按授权处理跨仓库交付。** 本目录是独立仓库，新增文件和提交必须在此仓库处理；父仓库指针更新不能代替子模块内容提交。仅在任务需要且得到相应授权时处理提交、推送、父仓库指针、扩展打包发布等操作，不顺带同步版本号或配置。
9. **验证与报告保持真实。** 按影响选择静态检查和人工回归，区分本次失败、既有问题、环境或服务限制；缺少本地工具时不使用未经说明的临时下载版本替代锁定工具。不能将 lint、README 声明或静态代码阅读写成播放、登录和兼容性验证成功。
10. **遇到重要未知先查证。** 对线上接口、打包约束和格式迁移等问题，先查实际调用与配置；仍无法确认且会实质影响变更时提出澄清，不写成已确认规则。架构和接口变化时更新本文；不自行建立固定分支名、提交格式、审批层级或覆盖率要求。
