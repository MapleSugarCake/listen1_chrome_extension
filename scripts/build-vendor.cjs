const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
const check = process.argv.includes('--check');
const selection = process.argv
  .find((arg) => arg.startsWith('--only='))
  ?.slice(7)
  .split(',');
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
const hash = (content) =>
  crypto.createHash('sha256').update(content).digest('hex');
const manifestFile = path.join(root, 'vendor/manifest.json');
const manifest = fs.existsSync(manifestFile)
  ? JSON.parse(fs.readFileSync(manifestFile, 'utf8'))
  : {};
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
    const licenses = fs
      .readdirSync(directory)
      .filter((file) => /^(licen[sc]e|copying)(\.|$)/i.test(file));
    if (!licenses.length) throw new Error(`Missing license: ${name}`);
    const license = licenses
      .map((file) => fs.readFileSync(path.join(directory, file), 'utf8'))
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
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
