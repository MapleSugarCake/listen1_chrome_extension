// Shared LRC timeline and per-track replacements. Audio/playlist identities are
// deliberately outside this store; backups already enumerate localStorage.
window.Lyrics = (() => {
  const prefix = 'lyric-override:';
  const timestamp = '\\[\\d+:[0-5]\\d(?:\\.\\d{1,3})?\\]';
  const leadingTimes = new RegExp(`^(?:${timestamp})+`);
  const metadata = /^(?:\[[a-zA-Z][\w-]*:[^\]]*\]\s*)+$/;
  const entities = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
  };
  const text = (value) =>
    typeof value === 'string'
      ? value.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
      : '';

  function lines(value, translationFlag) {
    const result = [];
    text(value)
      .split('\n')
      .forEach((input, index) => {
        const line = input.trimStart();
        if (metadata.test(line.trim())) return;
        const match = leadingTimes.exec(line);
        if (!match) return;
        const content = line
          .slice(match[0].length)
          .replace(
            /&(?:amp|lt|gt|quot|#39|apos);/g,
            (entity) => entities[entity]
          );
        const times = /\[(\d+):([0-5]\d)(?:\.(\d{1,3}))?\]/g;
        let time;
        // eslint-disable-next-line no-cond-assign
        while ((time = times.exec(match[0]))) {
          const seconds =
            Number(time[1]) * 60000 +
            Number(time[2]) * 1000 +
            Number((time[3] || '').padEnd(3, '0'));
          if (Number.isSafeInteger(seconds))
            result.push({ content, seconds, translationFlag, index });
        }
      });
    return result;
  }

  function parse(lyric, tlyric) {
    return lines(lyric, false)
      .concat(lines(tlyric, true))
      .sort(
        (a, b) =>
          a.seconds - b.seconds ||
          Number(a.translationFlag) - Number(b.translationFlag) ||
          a.index - b.index
      )
      .map((line, lineNumber) => ({ ...line, lineNumber }));
  }

  function validateLocal(value) {
    const input = text(value).split('\n');
    for (let index = 0; index < input.length; index += 1) {
      const line = input[index].trim();
      if (line && !metadata.test(line)) {
        const match = leadingTimes.exec(line);
        if (
          !match ||
          /^\[\d/.test(line.slice(match[0].length)) ||
          /<\d+:\d{2}(?:\.\d+)?>/.test(line) ||
          !lines(line, false).length
        )
          return { valid: false, code: 'INVALID_LRC', line: index + 1 };
      }
    }
    return lines(value, false).some((line) => line.content.trim())
      ? { valid: true }
      : { valid: false, code: 'NO_SYNC_LYRIC' };
  }

  function normalize(data) {
    const lyric = text(data?.lyric);
    if (!lines(lyric, false).some((line) => line.content.trim()))
      throw Object.assign(new Error('No synchronized lyrics'), {
        code: 'NO_SYNC_LYRIC',
      });
    const translation = text(data?.tlyric);
    const tlyric = lines(translation, true).some((line) => line.content.trim())
      ? translation
      : '';
    return { lyric, tlyric };
  }

  function key(trackId) {
    if (typeof trackId !== 'string' || !trackId)
      throw new Error('Invalid track ID');
    return prefix + trackId;
  }

  function getOverride(trackId) {
    try {
      const data = localStorage.getObject(key(trackId));
      if (typeof data?.lyric !== 'string' || typeof data?.tlyric !== 'string')
        return null;
      return normalize(data);
    } catch {
      return null;
    }
  }

  function saveOverride(trackId, data) {
    const replacement = { ...normalize(data), offsetMs: 0 };
    try {
      localStorage.setObject(key(trackId), replacement);
    } catch {
      throw Object.assign(new Error('Lyrics could not be saved'), {
        code: 'LYRIC_STORAGE',
      });
    }
    return replacement;
  }

  function getOffset(trackId) {
    try {
      const value = localStorage.getObject(key(trackId))?.offsetMs;
      return Number.isInteger(value) &&
        Math.abs(value) <= 60000 &&
        value % 300 === 0
        ? value
        : 0;
    } catch {
      return 0;
    }
  }

  function setOffset(trackId, offsetMs) {
    if (
      !Number.isInteger(offsetMs) ||
      Math.abs(offsetMs) > 60000 ||
      offsetMs % 300 !== 0
    )
      throw Object.assign(new Error('Invalid offset'), {
        code: 'LYRIC_OFFSET',
      });
    try {
      const previous = localStorage.getObject(key(trackId));
      localStorage.setObject(key(trackId), {
        ...(previous && typeof previous === 'object' && !Array.isArray(previous)
          ? previous
          : {}),
        offsetMs,
      });
    } catch {
      throw Object.assign(new Error('Lyrics could not be saved'), {
        code: 'LYRIC_STORAGE',
      });
    }
    return offsetMs;
  }

  // Transient playback snapshot lets the manager check already loaded lyrics offline.
  const loaded = new Map();
  function remember(trackId, data) {
    loaded.clear();
    loaded.set(trackId, data);
  }
  function forget(trackId) {
    loaded.delete(trackId);
  }
  function getLoaded(trackId) {
    return loaded.get(trackId);
  }

  function removeOverride(trackId) {
    try {
      localStorage.removeItem(key(trackId));
    } catch {
      throw Object.assign(new Error('Lyrics could not be saved'), {
        code: 'LYRIC_STORAGE',
      });
    }
  }

  return {
    parse,
    validateLocal,
    normalize,
    getOverride,
    saveOverride,
    removeOverride,
    getOffset,
    setOffset,
    remember,
    forget,
    getLoaded,
  };
})();
