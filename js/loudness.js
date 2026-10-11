/* global module */
/* eslint-disable no-await-in-loop -- Yield between sequential blocks to keep the UI responsive. */
// RMS is measured over source-selected active blocks, never after master volume.
const listen1Rms = (() => {
  const REFERENCE_DB = -20;
  const PEAK_DB = -6;
  const MAX_BOOST_DB = 24;
  const LIMIT_DB = 1;
  const toGain = (db) => 10 ** (db / 20);
  const error = (code) => Object.assign(new Error(code), { code });
  const yieldTask = () => new Promise((resolve) => setTimeout(resolve, 0));

  async function analyze(channels, sampleRate, isCurrent = () => true, mask) {
    if (
      !channels.length ||
      !channels[0].length ||
      !Number.isFinite(sampleRate) ||
      sampleRate <= 0
    )
      throw error('UNSUPPORTED_AUDIO');
    const frames = channels[0].length;
    if (channels.some((channel) => channel.length !== frames))
      throw error('UNSUPPORTED_AUDIO');
    const blockFrames = Math.max(1, Math.round(sampleRate / 10));
    const active = new Uint8Array(Math.ceil(frames / blockFrames));
    let energy = 0;
    let count = 0;
    let peak = 0;
    for (
      let start = 0, block = 0;
      start < frames;
      start += blockFrames, block += 1
    ) {
      if (!isCurrent()) throw error('CANCELLED');
      const end = Math.min(frames, start + blockFrames);
      let sum = 0;
      for (let channel = 0; channel < channels.length; channel += 1) {
        const data = channels[channel];
        for (let i = start; i < end; i += 1) {
          const value = data[i];
          if (!Number.isFinite(value)) throw error('UNSUPPORTED_AUDIO');
          sum += value * value;
          peak = Math.max(peak, Math.abs(value));
        }
      }
      const size = (end - start) * channels.length;
      if (mask ? mask[block] : sum / size >= 1e-6) {
        active[block] = 1;
        energy += sum;
        count += size;
      }
      if (block % 32 === 31) await yieldTask();
    }
    if (!count || !energy) throw error('NO_SIGNAL');
    return {
      rmsDb: 10 * Math.log10(energy / count),
      peak,
      active,
      frames,
      sampleRate,
    };
  }

  // Offline linked envelope: backward attack and forward release. At most 1 dB
  // reduction, with no independently amplified quiet sections or stereo shift.
  async function limit(channels, sampleRate, gain, isCurrent) {
    const frames = channels[0].length;
    const ceiling = toGain(PEAK_DB);
    const floor = toGain(-LIMIT_DB);
    const envelope = new Float32Array(frames);
    const attackStep = (1 - floor) / (sampleRate * 0.005);
    const releaseStep = (1 - floor) / (sampleRate * 0.1);
    let next = 1;
    for (let i = frames - 1; i >= 0; i -= 1) {
      let peak = 0;
      for (let channel = 0; channel < channels.length; channel += 1)
        peak = Math.max(peak, Math.abs(channels[channel][i]) * gain);
      const needed = peak > ceiling ? ceiling / peak : 1;
      if (needed < floor - 1e-6) throw error('LIMIT_BUDGET');
      next = Math.min(needed, next + attackStep);
      envelope[i] = next;
      if (i % 262144 === 0) {
        if (!isCurrent()) throw error('CANCELLED');
        await yieldTask();
      }
    }
    const output = channels.map(() => new Float32Array(frames));
    let previous = 1;
    let minimum = 1;
    for (let i = 0; i < frames; i += 1) {
      previous = Math.min(envelope[i], previous + releaseStep);
      minimum = Math.min(minimum, previous);
      for (let channel = 0; channel < channels.length; channel += 1)
        output[channel][i] = channels[channel][i] * gain * previous;
      if (i % 262144 === 0) {
        if (!isCurrent()) throw error('CANCELLED');
        await yieldTask();
      }
    }
    return { channels: output, reductionDb: -20 * Math.log10(minimum) };
  }

  async function normalize(
    channels,
    sampleRate,
    stats,
    mode,
    previousTarget,
    isCurrent = () => true
  ) {
    const peakDb = 20 * Math.log10(stats.peak);
    const safeGain = Math.min(MAX_BOOST_DB, PEAK_DB - peakDb);
    let targetDb = Math.min(
      REFERENCE_DB,
      previousTarget,
      stats.rmsDb + safeGain + (mode === 'standard' ? LIMIT_DB : 0),
      stats.rmsDb + MAX_BOOST_DB
    );
    let gainDb = targetDb - stats.rmsDb;
    let processed = null;
    let reductionDb = 0;
    let outputDb = targetDb;
    if (mode === 'standard' && gainDb > safeGain + 1e-6) {
      const limited = await limit(
        channels,
        sampleRate,
        toGain(gainDb),
        isCurrent
      );
      const measured = await analyze(
        limited.channels,
        sampleRate,
        isCurrent,
        stats.active
      );
      if (Math.abs(measured.rmsDb - targetDb) <= 0.5) {
        processed = limited.channels;
        outputDb = measured.rmsDb;
        reductionDb = limited.reductionDb;
      } else {
        // One conservative fallback, not iterative full-song DSP.
        targetDb = Math.min(targetDb, stats.rmsDb + safeGain);
        gainDb = targetDb - stats.rmsDb;
        outputDb = targetDb;
      }
    }
    if (!isCurrent()) throw error('CANCELLED');
    return {
      targetDb,
      gainDb,
      outputDb,
      reductionDb,
      processed,
      gain: processed ? 1 : toGain(gainDb),
    };
  }

  return {
    analyze,
    normalize,
    toGain,
    error,
    REFERENCE_DB,
    PEAK_DB,
    MAX_BOOST_DB,
    LIMIT_DB,
  };
})();
if (typeof window !== 'undefined') window.listen1Rms = listen1Rms;
if (typeof module !== 'undefined' && module.exports)
  module.exports = listen1Rms;
