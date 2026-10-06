/**
 * 文件职责：通过固定测试向量对比定制 forge 与标准实现的加密结果，验证依赖维护涉及的密码算法。
 *
 * 文件级定义：
 * - test：从 node:test 引入，用于注册 Node 行为测试。
 * - assert：从 node:assert/strict 引入，用于断言测试结果。
 * - fs：从 node:fs 引入，用于文件读写与目录操作。
 * - vm：从 node:vm 引入，用于执行带受控全局对象的测试源码。
 * - path：从 node:path 引入，用于路径解析和拼接。
 * - crypto：从 node:crypto 引入，用于计算校验摘要及加密测试参考值。
 * - upstream：从 node-forge 引入，用于upstream 操作。
 * - context：提供受控全局对象的测试虚拟机上下文。
 * - retained：虚拟机加载的保留版 forge 实现。
 */
/**
 * test：从 node:test 引入，用于注册 Node 行为测试；类型为 typeof import("node:test")。
 * @type {typeof import("node:test")}
 */
const test = require('node:test');
/**
 * assert：从 node:assert/strict 引入，用于断言测试结果；类型为 typeof import("node:assert/strict")。
 * @type {typeof import("node:assert/strict")}
 */
const assert = require('node:assert/strict');
/**
 * fs：从 node:fs 引入，用于文件读写与目录操作；类型为 typeof import("node:fs")。
 * @type {typeof import("node:fs")}
 */
const fs = require('node:fs');
/**
 * vm：从 node:vm 引入，用于执行带受控全局对象的测试源码；类型为 typeof import("node:vm")。
 * @type {typeof import("node:vm")}
 */
const vm = require('node:vm');
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
 * upstream：从 node-forge 引入，用于upstream 操作；类型为 typeof import("node-forge")。
 * @type {typeof import("node-forge")}
 */
const upstream = require('node-forge');
/**
 * context：提供受控全局对象的测试虚拟机上下文；类型为 Object。
 * @type {Object}
 */
const context = {
  window: {},
  setTimeout,
  clearTimeout,
  Uint8Array,
  ArrayBuffer,
};
vm.runInNewContext(
  fs.readFileSync(
    path.join(__dirname, '../js/vendor/forge_listen1_fork.min.js'),
    'utf8'
  ),
  context
);
/**
 * retained：虚拟机加载的保留版 forge 实现；类型为 Object。
 * @type {Object}
 */
const retained = context.window.forge;

for (const [name, forge] of [
  ['retained fork', retained],
  ['upstream 1.4.0', upstream],
]) {
  test(`${name}: provider digest, AES and OpenSSL derivation vectors` /**
   * 使用相同算法输入比较保留版与上游 forge 的输出；断言失败由测试运行器记录。
   * 无参数。
   * @returns {void} 无返回值。
   */, () => {
    for (const algorithm of ['md5', 'sha1']) {
      const value = 'Listen 1 中文 & # 2026';
      assert.equal(
        forge.md[algorithm]
          .create()
          .update(forge.util.encodeUtf8(value))
          .digest()
          .toHex(),
        crypto.createHash(algorithm).update(value).digest('hex')
      );
    }
    const key = '0123456789abcdef',
      iv = '0102030405060708';
    const text = 'provider payload';
    for (const mode of ['CBC', 'ECB']) {
      const cipher = forge.cipher.createCipher(`AES-${mode}`, key);
      cipher.start({ iv });
      cipher.update(forge.util.createBuffer(text));
      cipher.finish();
      const native = crypto.createCipheriv(
        `aes-128-${mode.toLowerCase()}`,
        key,
        mode === 'CBC' ? iv : null
      );
      assert.equal(
        cipher.output.toHex(),
        Buffer.concat([native.update(text), native.final()]).toString('hex')
      );
    }
    const salt = '12345678',
      secret = 'migu-vector';
    let previous = Buffer.alloc(0),
      bytes = Buffer.alloc(0);
    while (bytes.length < 48) {
      previous = crypto
        .createHash('md5')
        .update(
          Buffer.concat([previous, Buffer.from(secret), Buffer.from(salt)])
        )
        .digest();
      bytes = Buffer.concat([bytes, previous]);
    }
    assert.equal(
      forge.util.bytesToHex(forge.pbe.opensslDeriveBytes(secret, salt, 48)),
      bytes.toString('hex')
    );
    assert.equal(
      new forge.jsbn.BigInteger('4')
        .modPow(
          new forge.jsbn.BigInteger('13'),
          new forge.jsbn.BigInteger('497')
        )
        .toString(),
      '445'
    );
  });
}

test('Netease fixed eapi and weapi inputs remain identical with upstream forge' /**
 * 以固定输入比较网易云 eapi、weapi 在保留版与上游 forge 中的结果；断言失败由测试运行器记录。
 * 无参数。
 * @returns {void} 无返回值。
 */, () => {
  /**
   * 把指定 forge 实现注入网易云适配器，固定随机密钥以比较加密测试向量。
   * @param forge 用于当前加密测试向量的 forge 实现。
   * @returns {*} sandbox.provider。
   */
  function provider(forge) {
    const sandbox = vm.createContext({
      forge,
      /**
       * 测试替身：执行 Buffer.from().toString（"base64"），供用例观察调用与状态。
       * @param text 待处理的文本。
       * @returns {string} Buffer.from().toString 的调用结果。
       */
      btoa: (text) => Buffer.from(text, 'binary').toString('base64'),
    });
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, '../js/provider/netease.js'),
        'utf8'
      ) + '\nthis.provider = netease;',
      sandbox
    );
    /**
     * 测试替身：取得 "0123456789abcdef"，供用例观察调用与状态。
     * 无参数。
     * @returns {string} "0123456789abcdef"。
     */
    sandbox.provider._create_secret_key = () => '0123456789abcdef';
    return sandbox.provider;
  }
  const before = provider(retained),
    after = provider(upstream);
  const input = { ids: '[28707594]', br: 128000 };
  assert.equal(
    JSON.stringify(before.eapi('/api/song/enhance/player/url', input)),
    JSON.stringify(after.eapi('/api/song/enhance/player/url', input))
  );
  assert.equal(
    JSON.stringify(before.weapi(input)),
    JSON.stringify(after.weapi(input))
  );
});
