# 静态库维护

普通启动直接加载已提交的静态文件，不运行 npm 或打包器。开发依赖中固定的库版本用于生成这些文件，不会随应用打包整个 `node_modules`。

```sh
npm ci
npm run vendor:build
npm run vendor:check
npm test
```

`manifest.json` 列出全部可生成 JS/CSS 的版本、npm 来源、上游仓库、许可文件和 SHA-256。AngularJS、Axios、Howler、i18next、backend、async、Notyf 复制上游发行文件；hotkeys 和 LRUCache 使用固定版本 esbuild 生成浏览器 IIFE。构建顺序和选项位于 `scripts/build-vendor.cjs`。`--only=axios,howler` 可限定维护范围；生成后应提交资源、manifest、许可和锁文件的对应差异。

`retained.json` 记录没有替换的定制 forge。`test/crypto.test.cjs` 比较摘要、AES CBC/ECB、OpenSSL 派生、RSA 模幂以及网易云固定输入。通过这些向量不等于全部定制行为等价，因此页面继续使用原始文件，node-forge 1.4.0 只用于测试。原始构建来源不能完整还原，保留该限制及上游许可说明。

AngularJS 1.8.3 是本轮保留框架的最后一个公开版本，官方支持已结束且 npm audit 仍报告已知问题；升级到该版本不代表清零风险。页面 Node 能力已在桌面层隔离，后续框架迁移需要独立评估。

图片、字体、主题 CSS 和播放器业务脚本继续保留在各自目录，它们没有被伪装成新版本 vendor 包。此次未引入在线 CDN 运行依赖。
