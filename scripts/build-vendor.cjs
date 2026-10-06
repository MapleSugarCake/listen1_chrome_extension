/**
 * 文件职责：依据已固定的供应商清单构建或校验静态依赖，保留指定原件并检查输出哈希。
 *
 * 文件级定义：
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - crypto：从 node:crypto 引入，用于计算校验摘要及加密测试参考值。
 * - esbuild：从 esbuild 引入，用于打包或压缩供应商静态脚本。
 * - root：由脚本目录解析出的项目根目录。
 * - check：是否仅检查供应商产物而不写入。
 * - selection：命令行指定需要处理的供应商名称集合。
 * - definitions：静态供应商包的来源、入口与输出规则。
 * - hash：计算输入内容的 SHA-256 十六进制摘要，用于供应商产物一致性检查。
 * - manifestFile：已提交的供应商产物清单路径。
 * - manifest：从清单读取或生成的供应商版本与哈希记录。
 * - main：依据已固定的供应商清单构建或校验静态依赖，保留指定原件并检查输出哈希。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 */
/**
 * fs：从 node:fs 引入，用于文件读写与目录操作；类型为 typeof import("node:fs")。
 * @type {typeof import("node:fs")}
 */
const fs = require('node:fs');
/**
 * path：从 node:path 引入，用于路径解析和拼接；类型为 typeof import("node:path")。
 * @type {typeof import("node:path")}
 */
const path = require('node:path');
/**
 * crypto：从 node:crypto 引入，用于计算校验摘要及加密测试参考值；类型为 typeof import("node:crypto")。
 * @type {typeof import("node:crypto")}
 */
const crypto = require('node:crypto');
/**
 * esbuild：从 esbuild 引入，用于打包或压缩供应商静态脚本；类型为 typeof import("esbuild")。
 * @type {typeof import("esbuild")}
 */
const esbuild = require('esbuild');
/**
 * root：由脚本目录解析出的项目根目录；类型为 string。
 * @type {string}
 */
const root = path.resolve(__dirname, '..');
/**
 * check：是否仅检查供应商产物而不写入；类型为 boolean。
 * @type {boolean}
 */
const check = process.argv.includes('--check');
/**
 * selection：命令行指定需要处理的供应商名称集合；类型为 string[]|undefined。
 * @type {string[]|undefined}
 */
const selection = process.argv
  .find(
    /**
     * 筛选检查 process.argv 中的条目，arg.startsWith 的调用结果。
     * @param arg 来自 process.argv 的当前条目；使用 startsWith 字段。
     * @returns {*} arg.startsWith 的调用结果。
     */
    (arg) => arg.startsWith('--only=')
  )
  ?.slice(7)
  .split(',');
/**
 * definitions：静态供应商包的来源、入口与输出规则；类型为 Array。
 * @type {Array}
 */
const definitions = [
  ['angular', 'angular.min.js', 'js/vendor/angular.min.js'],
  ['axios', 'dist/axios.min.js', 'js/vendor/axios.min.js'],
  ['howler', 'dist/howler.core.min.js', 'js/vendor/howler.core.min.js'],
  ['i18next', 'dist/umd/i18next.min.js', 'js/vendor/i18next.min.js'],
  [
    'i18next-http-backend',
    'i18nextHttpBackend.min.js',
    'js/vendor/i18nextHttpBackend.min.js',
  ],
  [
    'hotkeys-js',
    null,
    'js/vendor/hotkeys.min.js',
    "import hotkeys from 'hotkeys-js'; window.hotkeys = hotkeys;",
  ],
  ['async', 'dist/async.min.js', 'js/vendor/async.min.js'],
  [
    'lru-cache',
    null,
    'js/vendor/lru-cache.min.js',
    "import { LRUCache } from 'lru-cache'; window.LRUCache = LRUCache;",
  ],
  ['notyf', 'notyf.min.js', 'js/vendor/notyf.min.js'],
  ['notyf', 'notyf.min.css', 'css/notyf.min.css'],
];
/**
 * 计算输入内容的 SHA-256 十六进制摘要，用于供应商产物一致性检查。
 * @param content 文件、歌词或备份内容。
 * @returns {*} crypto.createHash().update().digest 的调用结果。
 */
const hash = (content) =>
  crypto.createHash('sha256').update(content).digest('hex');
/**
 * manifestFile：已提交的供应商产物清单路径；类型为 string。
 * @type {string}
 */
const manifestFile = path.join(root, 'vendor/manifest.json');
/**
 * manifest：从清单读取或生成的供应商版本与哈希记录；类型为 Object。
 * @type {Object}
 */
const manifest = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  : {};
/**
 * 依据已固定的供应商清单构建或校验静态依赖，保留指定原件并检查输出哈希。异步步骤失败时向外拒绝，由入口统一设置退出状态。
 * 无参数。
 * @returns {Promise<void>} 异步完成后无返回值；拒绝由调用链处理。
 */
async function main() {
  const retained = JSON.parse(
    fs.readFileSync(path.join(root, 'vendor/retained.json'), 'utf8')
  );
  for (const [target, record] of Object.entries(retained)) {
    if (hash(fs.readFileSync(path.join(root, target))) !== record.sha256)
      throw new Error(`Retained vendor drift: ${target}`);
  }
  for (const [name, source, target, entry] of definitions) {
    if (selection && !selection.includes(name)) continue;
    const directory = path.join(root, 'node_modules', name);
    const metadata = JSON.parse(
      fs.readFileSync(path.join(directory, 'package.json'), 'utf8')
    );
    let bytes;
    if (source) bytes = fs.readFileSync(path.join(directory, source));
    else {
      const result = await esbuild.build({
        stdin: { contents: entry, resolveDir: root },
        bundle: true,
        minify: true,
        format: 'iife',
        platform: 'browser',
        target: ['chrome114', 'firefox115'],
        legalComments: 'inline',
        write: false,
      });
      bytes = Buffer.from(
        `/*! ${name} ${metadata.version}; ${metadata.license}; built with esbuild ${esbuild.version} */\n${result.outputFiles[0].text}`
      );
    }
    const licenses = fs.readdirSync(directory).filter(
      /**
       * 筛选检查 fs.readdirSync() 中的条目，/^(licen[sc]e|copying)(\.|$)/i.test 的布尔判断结果。
       * @param file 来自 fs.readdirSync() 的当前条目。
       * @returns {boolean} /^(licen[sc]e|copying)(\.|$)/i.test 的布尔判断结果。
       */
      (file) => /^(licen[sc]e|copying)(\.|$)/i.test(file)
    );
    if (!licenses.length) throw new Error(`Missing license: ${name}`);
    const license = licenses
      .map(
        /**
         * 转换 licenses 中的条目，fs.readFileSync 的调用结果。
         * @param file 来自 licenses 的当前条目。
         * @returns {*} fs.readFileSync 的调用结果。
         */
        (file) => fs.readFileSync(path.join(directory, file), 'utf8')
      )
      .join('\n');
    const licenseTarget = `vendor/licenses/${name}.txt`;
    for (const [file, content] of [
      [target, bytes],
      [licenseTarget, Buffer.from(license)],
    ]) {
      const destination = path.join(root, file);
      if (check) {
        if (
          !fs.existsSync(destination) ||
          hash(fs.readFileSync(destination)) !== hash(content)
        )
          throw new Error(`Vendor drift: ${file}`);
      } else {
        fs.mkdirSync(path.dirname(destination), { recursive: true });
        fs.writeFileSync(destination, content);
      }
    }
    const record = {
      package: name,
      version: metadata.version,
      source: source || 'esbuild browser bundle (see scripts/build-vendor.cjs)',
      registry: `https://registry.npmjs.org/${name}/${metadata.version}`,
      repository: metadata.repository?.url || metadata.repository,
      license: metadata.license,
      licenseFile: licenseTarget,
      sha256: hash(bytes),
    };
    if (check && JSON.stringify(manifest[target]) !== JSON.stringify(record))
      throw new Error(`Vendor manifest drift: ${target}`);
    manifest[target] = record;
    console.log(
      `${check ? 'Verified' : 'Generated'} ${target} (${name} ${metadata.version})`
    );
  }
  if (!check) {
    fs.mkdirSync(path.dirname(manifestFile), { recursive: true });
    fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + '\n');
  }
}
main().catch(
  /**
   * 异步操作失败后，更新 process.exitCode，执行 console.error。
   * @param error 被捕获或传入的异常；使用 message 字段。
   * @returns {void} 无返回值。
   */
  (error) => {
    console.error(error.message);
    process.exitCode = 1;
  }
);
