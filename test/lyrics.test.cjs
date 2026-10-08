const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = (name) =>
  fs.readFileSync(path.join(__dirname, '../js', name), 'utf8');
const plain = (value) => JSON.parse(JSON.stringify(value));

function storage() {
  const values = new Map();
  return {
    values,
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
    getObject(key) {
      try {
        return JSON.parse(this.getItem(key));
      } catch {
        return null;
      }
    },
    setObject(key, value) {
      this.setItem(key, JSON.stringify(value));
    },
  };
}

function harness() {
  const localStorage = storage();
  const context = vm.createContext({
    window: { listen1Desktop: {} },
    localStorage,
    URLSearchParams,
    AbortController,
    setTimeout,
    clearTimeout,
    console,
    LRUCache: class {
      get() {}
      set() {}
    },
    setPrototypeOfLocalStorage() {},
    getParameterByName: (name, url) =>
      new URL(url, 'https://fixture.invalid').searchParams.get(name),
  });
  vm.runInContext(read('lyrics.js'), context);
  vm.runInContext(read('provider/localmusic.js'), context);
  return {
    context,
    localStorage,
    lyrics: context.window.Lyrics,
    local: vm.runInContext('localmusic', context),
  };
}

test('LRC accepts BOM, metadata, blank lines and multiple timestamps; timeline retains translations', () => {
  const { lyrics } = harness();
  const lyric =
    '\uFEFF[ti:Title]\r\n[ar:]\r\n\r\n[0:01.2][01:02.003]A &amp; B\r\n[00:03]';
  assert.equal(lyrics.validateLocal(lyric).valid, true);
  const result = plain(lyrics.parse(lyric, '[00:01.200]译文'));
  assert.deepEqual(
    result.map(({ seconds, content, translationFlag, lineNumber }) => ({
      seconds,
      content,
      translationFlag,
      lineNumber,
    })),
    [
      {
        seconds: 1200,
        content: 'A & B',
        translationFlag: false,
        lineNumber: 0,
      },
      { seconds: 1200, content: '译文', translationFlag: true, lineNumber: 1 },
      { seconds: 3000, content: '', translationFlag: false, lineNumber: 2 },
      {
        seconds: 62003,
        content: 'A & B',
        translationFlag: false,
        lineNumber: 3,
      },
    ]
  );
});

test('manual LRC import rejects erroneous body lines and empty or enhanced lyrics', () => {
  const { lyrics } = harness();
  for (const bad of [
    'body without time',
    '[00:60]bad',
    '[00:01.1234]bad',
    '[00:01][00:99]bad',
    '[00:01]<00:01.20>word',
  ]) {
    const result = lyrics.validateLocal('[ti:Title]\n\n' + bad);
    assert.equal(result.code, 'INVALID_LRC');
    assert.equal(result.line, 3);
  }
  for (const empty of ['', '[ti:Title]\n[00:01]   ', 'plain text'])
    assert.equal(lyrics.validateLocal(empty).valid, false);
});

test('replacements are keyed by identity, discard absent/untimed translation and survive backup/reload', () => {
  const { lyrics, localStorage } = harness();
  lyrics.saveOverride('netrack_1', {
    lyric: '[00:01]first',
    tlyric: '[00:01]译文',
  });
  lyrics.saveOverride('qqtrack_1', { lyric: '[00:01]second' });
  assert.equal(lyrics.getOverride('netrack_1').tlyric, '[00:01]译文');
  lyrics.saveOverride('netrack_1', {
    lyric: '[00:02]new',
    tlyric: 'untimed old translation',
  });
  assert.equal(lyrics.getOverride('netrack_1').tlyric, '');
  assert.equal(lyrics.getOverride('qqtrack_1').lyric, '[00:01]second');
  const backup = JSON.stringify(
    Object.fromEntries(
      [...localStorage.values].map(([key]) => [
        key,
        localStorage.getObject(key),
      ])
    )
  );
  const restored = harness();
  Object.entries(JSON.parse(backup)).forEach(([key, value]) =>
    restored.localStorage.setObject(key, value)
  );
  assert.equal(restored.lyrics.getOverride('netrack_1').lyric, '[00:02]new');
  restored.lyrics.removeOverride('netrack_1');
  assert.equal(restored.lyrics.getOverride('netrack_1'), null);
  assert.equal(restored.lyrics.getOverride('qqtrack_1').lyric, '[00:01]second');
});

test('invalid data and storage failures never replace valid saved lyrics or erase damaged records', () => {
  const { lyrics, localStorage } = harness();
  lyrics.saveOverride('netrack_1', { lyric: '[00:01]kept' });
  assert.throws(() => lyrics.saveOverride('netrack_1', { lyric: 'untimed' }), {
    code: 'NO_SYNC_LYRIC',
  });
  localStorage.setItem = () => {
    throw Error('Quota');
  };
  assert.throws(
    () => lyrics.saveOverride('netrack_1', { lyric: '[00:02]lost' }),
    { code: 'LYRIC_STORAGE' }
  );
  assert.equal(lyrics.getOverride('netrack_1').lyric, '[00:01]kept');
  localStorage.values.set('lyric-override:broken', '{broken');
  assert.equal(lyrics.getOverride('broken'), null);
  assert.equal(localStorage.getItem('lyric-override:broken'), '{broken');
});

test('MediaService prioritizes overrides but explicit original requests preserve provider routing', async () => {
  const { context, lyrics } = harness();
  let calls = 0;
  const provider = {
    lyric: () => ({
      success(fn) {
        calls += 1;
        fn({ lyric: '[00:01]original' });
      },
    }),
  };
  for (const name of [
    'netease',
    'xiami',
    'qq',
    'kugou',
    'kuwo',
    'bilibili',
    'migu',
    'taihe',
    'myplaylist',
  ])
    context[name] = provider;
  context.getLocalStorageValue = () => [];
  vm.runInContext(read('request.js'), context);
  vm.runInContext(read('loweb.js'), context);
  const service = vm.runInContext('MediaService', context);
  lyrics.saveOverride('netrack_1', { lyric: '[00:01]custom' });
  assert.equal(
    (await service.getLyric('netrack_1').promise).lyric,
    '[00:01]custom'
  );
  assert.equal(calls, 0);
  assert.equal(
    (
      await service.getLyric('netrack_1', null, null, null, { original: true })
        .promise
    ).lyric,
    '[00:01]original'
  );
  assert.equal(calls, 1);
  lyrics.removeOverride('netrack_1');
  assert.equal(
    (await service.getLyric('netrack_1').promise).lyric,
    '[00:01]original'
  );
  const localId = 'lmtrack_C:/a.wav';
  context.localStorage.setObject('lmplaylist_reserve', {
    info: { id: 'lmplaylist_reserve' },
    tracks: [{ id: localId, artist: 'A_B & C', artist_id: 'lmartist_A_B & C' }],
  });
  assert.equal(
    (await service.getPlaylist('lmartist_A_B & C').promise).tracks[0].id,
    localId
  );
});

test('duplicate local imports preserve metadata, original lyrics and order while accepting new identities', () => {
  const { local, localStorage } = harness();
  const old = {
    id: 'lmtrack_C:/a.wav',
    title: 'User title',
    artist: '',
    lyrics: ['[00:01]original'],
  };
  localStorage.setObject('lmplaylist_reserve', {
    info: { id: 'lmplaylist_reserve' },
    tracks: [old],
  });
  local.add_playlist('lmplaylist_reserve', [
    { ...old, title: 'a', artist: 'new tag' },
    { id: 'lmtrack_C:/b.wav', title: 'b' },
  ]);
  const tracks = localStorage.getObject('lmplaylist_reserve').tracks;
  assert.deepEqual(tracks[1], old);
  assert.equal(tracks[0].title, 'b');
});

test('metadata edits synchronize local library, user playlists and legacy queue without changing identity or audio', () => {
  const { local, localStorage } = harness();
  const track = {
    id: 'lmtrack_C:/a.wav',
    title: 'a',
    artist: 'tag',
    album: 'tag',
    source: 'localmusic',
    sound_url: 'file:///C:/a.wav',
    lyrics: ['original'],
  };
  localStorage.setObject('lmplaylist_reserve', {
    info: { id: 'lmplaylist_reserve' },
    tracks: [track],
  });
  localStorage.setObject('playerlists', ['myplaylist_1']);
  localStorage.setObject('myplaylist_1', {
    info: { title: 'Kept list' },
    tracks: [track, { id: 'netrack_1', title: 'same' }],
  });
  localStorage.setObject('current-playing', [track]);
  const fields = plain(
    local.update_track(track.id, {
      title: ' New title ',
      artist: ' A_B ',
      album: '',
    })
  );
  assert.equal(fields.artist_id, 'lmartist_A_B');
  for (const key of ['lmplaylist_reserve', 'myplaylist_1', 'current-playing']) {
    const value = localStorage.getObject(key);
    const updated = (Array.isArray(value) ? value : value.tracks)[0];
    assert.equal(updated.title, 'New title');
    assert.equal(updated.album, '');
    assert.equal(updated.id, track.id);
    assert.equal(updated.sound_url, track.sound_url);
    assert.deepEqual(updated.lyrics, track.lyrics);
  }
  assert.equal(localStorage.getObject('myplaylist_1').info.title, 'Kept list');
  assert.equal(localStorage.getObject('myplaylist_1').tracks[1].title, 'same');
  let filtered;
  local.lm_artist('/playlist?list_id=lmartist_A_B').success((value) => {
    filtered = value;
  });
  assert.equal(filtered.tracks.length, 1);
  assert.throws(
    () => local.update_track(track.id, { title: ' ', artist: '', album: '' }),
    { code: 'LOCAL_METADATA' }
  );
});

test('metadata persistence rolls back earlier snapshots if a subsequent write fails', () => {
  const { local, localStorage } = harness();
  const track = { id: 'lmtrack_C:/a.wav', title: 'kept' };
  localStorage.setObject('lmplaylist_reserve', { tracks: [track] });
  localStorage.setObject('current-playing', [track]);
  const original = new Map(localStorage.values);
  const save = localStorage.setItem;
  let writes = 0;
  localStorage.setItem = (key, value) => {
    writes += 1;
    if (writes === 2) throw Error('Quota');
    return save(key, value);
  };
  assert.throws(
    () => local.update_track(track.id, { title: 'new', artist: '', album: '' }),
    { code: 'LYRIC_STORAGE' }
  );
  assert.deepEqual(localStorage.values, original);
});

function deferred() {
  let resolve;
  let reject;
  const success = [];
  const failure = [];
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return {
    promise,
    cancel() {},
    success(fn) {
      success.push(fn);
      return this;
    },
    error(fn) {
      failure.push(fn);
      return this;
    },
    onProgress() {},
    resolve(data) {
      success.forEach((fn) => fn(data));
      resolve(data);
    },
    reject(error) {
      failure.forEach((fn) => fn(error));
      reject(error);
    },
  };
}

function managerHarness() {
  const { context, lyrics, localStorage } = harness();
  const handlers = new Map();
  const watches = new Map();
  const queued = [];
  const scope = {
    $on: (name, fn) => handlers.set(name, fn),
    $watch: (name, fn) => watches.set(name, fn),
    $evalAsync: (fn) => {
      if (fn) queued.push(fn);
    },
  };
  const events = [];
  const root = { $broadcast: (name, ...args) => events.push({ name, args }) };
  root.$new = () => ({ ...scope, $on() {} });
  const requests = [];
  const searches = [];
  const file = deferred();
  context.window.listen1Desktop.importLocalLyric = () => file.promise;
  context.document = { contains: () => false, activeElement: null };
  context.i18next = {
    t: (key, options) => key + (options?.line || ''),
    on() {},
    off() {},
  };
  context.sourceList = [{ name: 'netease' }, { name: 'qq' }];
  context.MediaService = {
    getLyric: () => {
      const task = deferred();
      requests.push(task);
      return task;
    },
    search: () => {
      const task = deferred();
      searches.push(task);
      return task;
    },
  };
  context.l1Player = {};
  let factory;
  let session;
  context.window.injectTrackManagement = null;
  vm.runInContext(read('track_management.js'), context);
  context.window.injectTrackManagement({
    factory(name, declaration) {
      session = declaration.at(-1)(root);
    },
    directive(name, declaration) {
      if (name === 'trackManager') factory = declaration.at(-1);
    },
  });
  factory(root, (fn) => fn(), session).link(scope, [
    { querySelector: () => null, querySelectorAll: () => [] },
  ]);
  const open = (id = 'netrack_target') =>
    handlers.get('track-manager:open')(
      {},
      { mode: 'lyrics', track: { id, title: 'target', source: 'netease' } }
    );
  const flush = async () => {
    await new Promise(setImmediate);
    while (queued.length) queued.shift()();
  };
  return {
    scope,
    requests,
    searches,
    file,
    lyrics,
    localStorage,
    events,
    open,
    flush,
    handlers,
    watches,
    session,
  };
}

test('candidate generations reject delayed callbacks and queued digest updates; apply saves only the fixed target', async () => {
  const h = managerHarness();
  h.open();
  h.scope.select({ id: 'qqtrack_a', title: 'A', source: 'qq' });
  h.scope.select({ id: 'qqtrack_b', title: 'B', source: 'qq' });
  h.requests[1].resolve({ lyric: '[00:01]B' });
  await new Promise(setImmediate); // B is queued for Angular but has not rendered.
  h.scope.select({ id: 'qqtrack_c', title: 'C', source: 'qq' });
  h.requests[0].resolve({ lyric: '[00:01]A' });
  h.requests[2].resolve({ lyric: '[00:01]C', tlyric: '' });
  await h.flush();
  assert.equal(h.scope.state.preview.lyric, '[00:01]C');
  h.scope.apply();
  assert.equal(h.lyrics.getOverride('netrack_target').lyric, '[00:01]C');
  assert.equal(h.lyrics.getOverride('qqtrack_c'), null);
  assert.equal(h.events.at(-1).name, 'lyrics:changed');
});

test('search generations, closed imports and theme changes cannot update a new target or persist lyrics', async () => {
  const h = managerHarness();
  h.open();
  h.session.open({ id: 'netrack_target', title: 'target' });
  h.session.editor.state.keywords = 'new';
  h.session.search();
  h.searches[2].resolve({ result: [{ id: 'qqtrack_new', source: 'netease' }] });
  h.searches[0].resolve({ result: [{ id: 'qqtrack_old', source: 'qq' }] });
  await h.flush();
  assert.equal(h.session.editor.state.candidates[0].id, 'qqtrack_new');
  h.scope.importLyric();
  h.scope.close();
  h.open('netrack_other');
  h.file.resolve({
    cancelled: false,
    lyric: '[00:01]late file',
    fileName: 'late.lrc',
  });
  await h.flush();
  assert.equal(h.scope.state.preview, undefined);
  assert.equal(h.localStorage.values.size, 0);
  h.scope.select({ id: 'qqtrack_a', title: 'A', source: 'qq' });
  h.watches.get('theme')('black2', 'white');
  h.requests[0].resolve({ lyric: '[00:01]late theme' });
  await h.flush();
  assert.equal(h.scope.state.target, undefined);
});

test('dialog storage failure keeps the old version and publishes no success event', async () => {
  const h = managerHarness();
  h.open();
  h.lyrics.saveOverride('netrack_target', { lyric: '[00:01]kept' });
  h.scope.select({ id: 'qqtrack_a', title: 'A', source: 'qq' });
  h.requests[0].resolve({ lyric: '[00:01]replacement' });
  await h.flush();
  h.localStorage.setItem = () => {
    throw Error('Quota');
  };
  h.scope.apply();
  assert.equal(h.scope.state.errorCode, 'LYRIC_STORAGE');
  assert.equal(h.scope.state.message, '');
  assert.equal(h.events.length, 0);
  assert.equal(h.lyrics.getOverride('netrack_target').lyric, '[00:01]kept');
});

test('offset-only records keep provider lyrics, old records default to zero and replacements atomically reset timing', () => {
  const { lyrics, localStorage } = harness();
  localStorage.setObject('lyric-override:old', {
    lyric: '[00:01]old',
    tlyric: '',
  });
  assert.equal(lyrics.getOffset('old'), 0);
  lyrics.setOffset('original', -300);
  assert.equal(lyrics.getOverride('original'), null);
  assert.equal(lyrics.getOffset('original'), -300);
  lyrics.setOffset('old', 600);
  assert.equal(lyrics.getOverride('old').lyric, '[00:01]old');
  assert.equal(lyrics.getOffset('old'), 600);
  for (const invalid of [601, 60001, Infinity, '300', 1.5])
    assert.throws(() => lyrics.setOffset('old', invalid), {
      code: 'LYRIC_OFFSET',
    });
  assert.equal(lyrics.getOffset('old'), 600);
  for (const boundary of [-60000, 60000]) {
    lyrics.setOffset('old', boundary);
    assert.equal(lyrics.getOffset('old'), boundary);
  }
  const backup = JSON.parse(
    JSON.stringify(Object.fromEntries(localStorage.values))
  );
  const restored = harness();
  Object.entries(backup).forEach(([key, value]) =>
    restored.localStorage.setItem(key, value)
  );
  assert.equal(restored.lyrics.getOffset('old'), 60000);
  assert.equal(restored.lyrics.getOffset('original'), -300);
  lyrics.saveOverride('old', { lyric: '[00:02]new' });
  assert.equal(lyrics.getOffset('old'), 0);
  lyrics.removeOverride('original');
  assert.equal(lyrics.getOffset('original'), 0);
});

test('failed offset/save/restore keeps old timing and content; preview and failed restore do not reset', async () => {
  const h = managerHarness();
  h.open();
  h.lyrics.saveOverride('netrack_target', { lyric: '[00:01]kept' });
  h.lyrics.setOffset('netrack_target', -600);
  h.scope.toggleTiming();
  assert.equal(h.scope.state.syncAvailable, true);
  h.scope.select({ id: 'qqtrack_a', title: 'A' });
  h.requests[0].resolve({ lyric: '[00:01]preview' });
  await h.flush();
  assert.equal(h.lyrics.getOffset('netrack_target'), -600);
  h.scope.restore();
  h.requests[1].reject({ code: 'TIMEOUT' });
  await h.flush();
  assert.equal(h.lyrics.getOffset('netrack_target'), -600);
  assert.equal(h.lyrics.getOverride('netrack_target').lyric, '[00:01]kept');
  h.localStorage.setItem = () => {
    throw Error('Quota');
  };
  h.scope.adjust(300);
  assert.equal(h.lyrics.getOffset('netrack_target'), -600);
  assert.equal(h.scope.state.errorCode, 'LYRIC_STORAGE');
  h.localStorage.removeItem = () => {
    throw Error('Denied');
  };
  h.scope.restore();
  h.requests[2].resolve({ lyric: '[00:01]original' });
  await h.flush();
  assert.equal(h.lyrics.getOffset('netrack_target'), -600);
  assert.equal(
    h.events.filter((event) => event.name === 'lyrics:changed').length,
    0
  );
});

test('platform filtering and cached pages issue no repeat requests, partial failures retry independently', async () => {
  const h = managerHarness();
  h.session.open({ id: 'netrack_target', title: 'target' });
  h.searches[0].resolve({
    result: [{ id: 'ne1', source: 'netease' }],
    hasMore: true,
  });
  h.searches[1].reject({ code: 'NETWORK' });
  await h.flush();
  h.session.filter('netease');
  h.session.filter('allmusic');
  assert.equal(h.searches.length, 2);
  h.session.load('qq');
  h.searches[2].resolve({
    result: [{ id: 'qq1', source: 'qq' }],
    hasMore: false,
  });
  await h.flush();
  h.session.page(1);
  assert.equal(h.searches.length, 4);
  h.searches[3].resolve({
    result: [{ id: 'ne2', source: 'netease' }],
    hasMore: false,
  });
  await h.flush();
  assert.deepEqual(
    plain(h.session.editor.state.candidates.map((track) => track.id)),
    ['ne2']
  );
  h.session.page(-1);
  h.session.page(1);
  assert.equal(h.searches.length, 4);
  h.session.filter('qq');
  assert.equal(h.session.editor.state.curpage, 1);
  assert.equal(h.session.editor.state.candidates[0].id, 'qq1');
  h.session.editor.state.keywords = 'changed';
  h.session.search();
  h.session.leave();
  h.searches[4].resolve({ result: [{ id: 'late', source: 'netease' }] });
  await h.flush();
  assert.equal(h.session.editor.state.candidates.length, 0);
});

test('only a stationary down/up on the backdrop closes the modal', () => {
  const h = managerHarness();
  const overlay = {};
  const dialog = {};
  const event = (target, x = 0) => ({
    target,
    currentTarget: overlay,
    button: 0,
    clientX: x,
    clientY: 0,
  });
  for (const [down, up] of [
    [dialog, overlay],
    [overlay, dialog],
  ]) {
    h.open();
    h.scope.press(event(down));
    h.scope.release(event(up));
    h.scope.backdrop(event(overlay));
    assert.ok(h.scope.state.target);
  }
  h.scope.press(event(overlay));
  h.scope.move(event(overlay, 20));
  h.scope.release(event(overlay));
  h.scope.backdrop(event(overlay));
  assert.ok(h.scope.state.target);
  h.scope.press(event(overlay));
  h.scope.release(event(overlay));
  h.scope.backdrop(event(overlay));
  assert.equal(h.scope.state.target, undefined);
});
