const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const crypto = require('node:crypto');
const upstream = require('node-forge');
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
const retained = context.window.forge;

for (const [name, forge] of [
  ['retained fork', retained],
  ['upstream 1.4.0', upstream],
]) {
  test(`${name}: provider digest, AES and OpenSSL derivation vectors`, () => {
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

test('Netease fixed eapi and weapi inputs remain identical with upstream forge', () => {
  function provider(forge) {
    const sandbox = vm.createContext({
      forge,
      btoa: (text) => Buffer.from(text, 'binary').toString('base64'),
    });
    vm.runInContext(
      fs.readFileSync(
        path.join(__dirname, '../js/provider/netease.js'),
        'utf8'
      ) + '\nthis.provider = netease;',
      sandbox
    );
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
