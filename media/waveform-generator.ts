/**
 * Artone v3 — Audio Waveform Generator
 *
 * Computes per-bin peak (min/max) and RMS amplitude data from PCM audio
 * for waveform display in the timeline. Supports mono and multi-channel audio.
 *
 * The output `WaveformData` contains one `WaveformBin` per display pixel (bin),
 * each capturing the minimum sample, maximum sample, and RMS over that range.
 * This is the standard approach used by DAWs for efficient waveform rendering:
 * the peaks are computed offline and stored; rendering reads the data without
 * touching the raw audio.
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options for waveform computation. */
export interface WaveformOptions {
  /**
   * Number of output bins (display pixels / columns).
   * Default: 1000.
   */
  bins?: number;
  /**
   * If true, compute RMS amplitude per bin (slower but used for loudness display).
   * Default: true.
   */
  computeRMS?: boolean;
  /**
   * Which channel to analyse:
   *   - `'mono'`: mix all channels to mono before analysing.
   *   - `number`: analyse only that zero-based channel index.
   * Default: `'mono'`.
   */
  channel?: number | 'mono';
}

/** Waveform statistics for a single display bin (time slice). */
export interface WaveformBin {
  /** Minimum sample value in this bin. */
  min: number;
  /** Maximum sample value in this bin. */
  max: number;
  /** Root-mean-square amplitude of all samples in this bin. */
  rms: number;
}

/** Computed waveform data for one audio source. */
export interface WaveformData {
  /** Per-bin statistics (length === `options.bins`). */
  bins: readonly WaveformBin[];
  /** Number of raw audio samples per bin (may be fractional for the last bin). */
  samplesPerBin: number;
  /** Total number of samples analysed. */
  totalSamples: number;
  /**
   * Peak absolute amplitude across all bins: `max(|min|, |max|)` over every bin.
   * Used to normalise the waveform for display.
   */
  peakAmplitude: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function computeBinsFromMono(
  samples: Float32Array,
  numBins: number,
  doRMS: boolean,
): WaveformBin[] {
  const n = samples.length;
  if (n === 0) {
    return Array.from({ length: numBins }, () => ({ min: 0, max: 0, rms: 0 }));
  }

  const bins: WaveformBin[] = [];
  const binSize = n / numBins;

  for (let b = 0; b < numBins; b++) {
    const startIdx = Math.floor(b * binSize);
    const endIdx   = Math.min(n, Math.floor((b + 1) * binSize));

    if (startIdx >= endIdx) {
      bins.push({ min: 0, max: 0, rms: 0 });
      continue;
    }

    let mn = Infinity;
    let mx = -Infinity;
    let sumSq = 0;

    for (let i = startIdx; i < endIdx; i++) {
      const v = samples[i];
      if (v < mn) mn = v;
      if (v > mx) mx = v;
      if (doRMS) sumSq += v * v;
    }

    const count = endIdx - startIdx;
    bins.push({
      min: mn,
      max: mx,
      rms: doRMS ? Math.sqrt(sumSq / count) : 0,
    });
  }

  return bins;
}

function monoMix(channels: Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0];
  const len = channels[0].length;
  const mono = new Float32Array(len);
  const inv  = 1 / channels.length;
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i];
    mono[i] = sum * inv;
  }
  return mono;
}

function buildResult(bins: WaveformBin[], totalSamples: number, numBins: number): WaveformData {
  let peak = 0;
  for (const b of bins) {
    if (Math.abs(b.min) > peak) peak = Math.abs(b.min);
    if (Math.abs(b.max) > peak) peak = Math.abs(b.max);
  }
  return {
    bins,
    samplesPerBin: totalSamples / numBins,
    totalSamples,
    peakAmplitude: peak,
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Compute waveform data from a mono Float32Array of audio samples.
 *
 * @param samples  PCM audio samples (typically −1 to +1 range).
 * @param options  Waveform options.
 *
 * @example
 * ```ts
 * const waveform = computeWaveform(audioBuffer.getChannelData(0), { bins: 800 });
 * // Render: for each bin b, draw vertical bar from b.min to b.max
 * ```
 */
export function computeWaveform(
  samples: Float32Array,
  options: WaveformOptions = {},
): WaveformData {
  const numBins = Math.max(1, options.bins ?? 1000);
  const doRMS   = options.computeRMS ?? true;
  const bins    = computeBinsFromMono(samples, numBins, doRMS);
  return buildResult(bins, samples.length, numBins);
}

/**
 * Compute waveform data from a multi-channel audio source.
 *
 * @param channels  Array of per-channel Float32Array PCM samples.
 *                  All channels must be the same length.
 * @param options   If `channel` is `'mono'` (default), channels are averaged.
 *                  If `channel` is a number, only that channel is used.
 *
 * @example
 * ```ts
 * const stereo = [leftChannel, rightChannel];
 * const waveform = computeWaveformMultichannel(stereo, { bins: 1000 });
 * ```
 */
export function computeWaveformMultichannel(
  channels: Float32Array[],
  options: WaveformOptions = {},
): WaveformData {
  if (channels.length === 0) {
    const numBins = Math.max(1, options.bins ?? 1000);
    return buildResult(
      Array.from({ length: numBins }, () => ({ min: 0, max: 0, rms: 0 })),
      0,
      numBins,
    );
  }

  let source: Float32Array;
  const ch = options.channel ?? 'mono';
  if (ch === 'mono') {
    source = monoMix(channels);
  } else {
    const idx = Math.max(0, Math.min(channels.length - 1, ch));
    source = channels[idx];
  }

  return computeWaveform(source, options);
}

/**
 * Normalise a `WaveformData` so that `peakAmplitude = 1.0`.
 *
 * Returns the input unchanged if `peakAmplitude === 0` (silent signal).
 * Does **not** mutate the original; returns a new `WaveformData`.
 */
export function normalizeWaveform(data: WaveformData): WaveformData {
  if (data.peakAmplitude === 0) return data;
  const inv = 1 / data.peakAmplitude;
  const bins: WaveformBin[] = data.bins.map((b) => ({
    min: b.min * inv,
    max: b.max * inv,
    rms: b.rms * inv,
  }));
  return {
    bins,
    samplesPerBin: data.samplesPerBin,
    totalSamples:  data.totalSamples,
    peakAmplitude: 1,
  };
}

/**
 * Downsample a high-resolution `WaveformData` to fewer bins by merging
 * adjacent bins (for responsive/zoom-out display).
 *
 * @param data     Source waveform (bins.length ≥ targetBins).
 * @param targetBins  Desired number of output bins.
 */
export function downsampleWaveform(data: WaveformData, targetBins: number): WaveformData {
  const n = data.bins.length;
  const t = Math.max(1, Math.min(n, targetBins));
  if (t === n) return data;

  const ratio = n / t;
  const newBins: WaveformBin[] = [];

  for (let i = 0; i < t; i++) {
    const startBin = Math.floor(i * ratio);
    const endBin   = Math.min(n, Math.floor((i + 1) * ratio));
    let mn = Infinity, mx = -Infinity, sumRmsSq = 0;
    const count = endBin - startBin;

    for (let j = startBin; j < endBin; j++) {
      const b = data.bins[j];
      if (b.min < mn) mn = b.min;
      if (b.max > mx) mx = b.max;
      sumRmsSq += b.rms * b.rms;
    }

    newBins.push({
      min: mn === Infinity ? 0 : mn,
      max: mx === -Infinity ? 0 : mx,
      rms: count > 0 ? Math.sqrt(sumRmsSq / count) : 0,
    });
  }

  let peak = 0;
  for (const b of newBins) {
    if (Math.abs(b.min) > peak) peak = Math.abs(b.min);
    if (Math.abs(b.max) > peak) peak = Math.abs(b.max);
  }

  return {
    bins: newBins,
    samplesPerBin: data.totalSamples / t,
    totalSamples:  data.totalSamples,
    peakAmplitude: peak,
  };
}
