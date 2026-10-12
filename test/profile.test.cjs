const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(
  path.join(__dirname, '../js/controller/profile.js'),
  'utf8'
);

async function profile(desktop, release) {
  let controller;
  const requests = [];
  const elements = {};
  const scope = {
    $on() {},
    $evalAsync(callback) {
      callback();
    },
  };
  const context = {
    angular: {
      module: () => ({
        controller(name, dependencies) {
          controller = dependencies.at(-1);
        },
      }),
    },
    isElectron: () => desktop,
    navigator: { language: 'zh-CN' },
    localStorage: { getObject: () => null, setObject() {} },
    document: {
      getElementById(id) {
        elements[id] ||= {};
        return elements[id];
      },
    },
    window: { listen1Desktop: { on: () => () => {}, control() {} } },
    i18next: { changeLanguage: async () => (key) => key },
    sourceList: [],
    platformSourceList: [],
    axios: {
      get(url) {
        if (url.includes('/releases/latest')) {
          requests.push(url);
          return release instanceof Error
            ? Promise.reject(release)
            : Promise.resolve({ data: release });
        }
        return Promise.resolve({
          data: url.endsWith('.json') ? {} : '',
        });
      },
    },
  };
  vm.runInNewContext(source, context);
  controller(scope);
  scope.initProfile();
  await new Promise(setImmediate);
  return { scope, requests };
}

for (const desktop of [true, false]) {
  const environment = desktop ? 'desktop' : 'extension';
  const repository = desktop
    ? 'listen1_maple_desktop'
    : 'listen1_maple_extension';
  const homepage = `https://github.com/MapleSugarCake/${repository}`;

  test(`${environment} uses its fork for release queries and about links`, async () => {
    const { scope, requests } = await profile(desktop, { tag_name: 'v2.36.0' });
    assert.deepEqual(requests, [
      `https://api.github.com/repos/MapleSugarCake/${repository}/releases/latest`,
    ]);
    assert.deepEqual(JSON.parse(JSON.stringify(scope.about)), {
      name: 'listen1_maple',
      email: 'maplecakeqaq@gmail.com',
      homepage,
      issues: `${homepage}/issues`,
    });
    assert.equal(
      scope.currentVersion,
      desktop ? '2.35.1_maple' : '2.33.0_maple'
    );
    assert.equal(scope.lastestVersion, 'v2.36.0_maple');
  });

  test(`${environment} does not duplicate an existing display suffix`, async () => {
    const { scope } = await profile(desktop, { tag_name: ' v2.36.0_maple ' });
    assert.equal(scope.lastestVersion, 'v2.36.0_maple');
  });

  test(`${environment} hides absent or invalid release tags without querying upstream`, async () => {
    for (const release of [
      undefined,
      null,
      {},
      { tag_name: '' },
      { tag_name: ' ' },
      { tag_name: 23 },
    ]) {
      const { scope, requests } = await profile(desktop, release);
      assert.equal(scope.lastestVersion, '');
      assert.equal(requests.length, 1);
    }
  });

  test(`${environment} clears an earlier result when a subsequent query fails`, async () => {
    for (const message of ['404', 'network failure', 'rate limited']) {
      const { scope, requests } = await profile(desktop, new Error(message));
      scope.lastestVersion = 'v2.35.1_maple';
      scope.initProfile();
      await new Promise(setImmediate);
      assert.equal(scope.lastestVersion, '');
      assert.equal(requests.length, 2);
    }
  });
}
