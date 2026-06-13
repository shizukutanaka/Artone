/**
 * Artone v3 — Loudness (ITU-R BS.1770-4 / EBU R128) + Auto-Ducking
 *
 * オフライン解析用の純関数群 (AudioWorklet の realtime path ではない)。
 * 既存 `audio-engine.ts` の簡易 RMS 実装を、規格準拠の測定に置き換える:
 *  - K-weighting プレフィルタ (stage1 high-shelf + stage2 high-pass)
 *  - ゲーティング積分ラウドネス (絶対 -70 LUFS + 相対 -10 LU)
 *  - momentary(400ms)/short-term(3s) 窓ラウドネス
 *  - Loudness Range (LRA, EBU Tech 3342: 相対 -20 LU, 10-95 パーセンタイル)
 *  - True Peak (4x オーバーサンプリング近似, BS.1770-4 Annex 2)
 *  - マルチチャンネル channel-weighted 加算 (L/R/C=1.0, surround=1.41)
 *
 * 設計根拠: ITU-R BS.1770-4 / EBU R128 / EBU Tech 3342。
 * 係数導出は libebur128 / pyloudnorm と同一 (48kHz で規格係数に一致, 任意 fs 対応)。
 *
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

/** transposed direct-form II biquad の係数 (a0 は 1 に正規化済み)。 */
export interface BiquadCoeffs {
  b0: number;
  b1: number;
  b2: number;
  a1: number;
  a2: number;
}

/** K-weighting 2段フィルタの係数。 */
export interface KWeightingCoeffs {
  stage1: BiquadCoeffs;
  stage2: BiquadCoeffs;
}

/** BS.1770/R128 ラウドネス測定結果 (全て LUFS / dBTP / dBFS)。 */
export interface LoudnessMeasurement {
  momentary: number;
  shortTerm: number;
  integrated: number;
  /** LRA (Loudness Range, EBU Tech 3342). */
  range: number;
  /** Alias for {@link range}. */
  loudnessRange: number;
  truePeak: number;
  /** Sample peak in dBFS (no oversampling). */
  samplePeak: number;
}

/** Stateful streaming loudness meter. */
export interface LoudnessMeter {
  /** Feed the next block of audio. `channels` may vary in length between calls. */
  process(channels: Float32Array[]): void;
  /** Return aggregate measurement over all processed audio so far. */
  getMeasurement(): LoudnessMeasurement;
  /** Clear all accumulated state. */
  reset(): void;
}

/** 自動ダッキングのパラメータ。 */
export interface DuckingOptions {
  sampleRate: number;
  /** これを超えるサイドチェーン(セリフ)レベルでダッキング開始 (dBFS)。既定 -30。 */
  thresholdDb?: number;
  /** ダッキング量 (dB, 負値)。既定 -12。 */
  duckDb?: number;
  /** ダッキングへ入る時定数 (ms)。既定 50。 */
  attackMs?: number;
  /** ダッキングから戻る時定数 (ms)。既定 300。 */
  releaseMs?: number;
}

// ============================================================
// Constants
// ============================================================

/** BS.1770 ラウドネス較正オフセット。 */
const ABS_OFFSET = -0.691;
/** 絶対ゲート閾値 (LUFS)。 */
const ABSOLUTE_GATE = -70;
/** 積分ラウドネスの相対ゲート (LU)。 */
const RELATIVE_GATE_INTEGRATED = -10;
/** LRA の相対ゲート (LU, EBU Tech 3342)。 */
const RELATIVE_GATE_LRA = -20;

/**
 * チャンネル重み (BS.1770)。L/R/C=1.0、surround(Ls/Rs)=1.41、LFE=0(除外)。
 * index は AudioBuffer のチャンネル順 (0:L 1:R 2:C 3:LFE 4:Ls 5:Rs) を仮定。
 */
function channelWeight(index: number): number {
  if (index === 3) return 0; // LFE は除外
  return index >= 4 ? 1.41 : 1.0;
}

// ============================================================
// K-weighting
// ============================================================

/**
 * 指定サンプルレートの K-weighting 係数を導出する。
 * 48kHz で BS.1770-4 の規定係数に一致 (libebur128/pyloudnorm と同一導出)。
 */
export function kWeightingCoeffs(sampleRate: number): KWeightingCoeffs {
  // Stage 1: high-shelf
  const f0 = 1681.9744509555319;
  const gainDb = 3.99984385397;
  const q1 = 0.7071752369554196;
  const k1 = Math.tan((Math.PI * f0) / sampleRate);
  const vh = Math.pow(10, gainDb / 20);
  const vb = Math.pow(vh, 0.4996667741545416);
  const den1 = 1 + k1 / q1 + k1 * k1;
  const stage1: BiquadCoeffs = {
    b0: (vh + (vb * k1) / q1 + k1 * k1) / den1,
    b1: (2 * (k1 * k1 - vh)) / den1,
    b2: (vh - (vb * k1) / q1 + k1 * k1) / den1,
    a1: (2 * (k1 * k1 - 1)) / den1,
    a2: (1 - k1 / q1 + k1 * k1) / den1,
  };

  // Stage 2: high-pass (RLB)
  const f0b = 38.13547087602444;
  const q2 = 0.5003270373238773;
  const k2 = Math.tan((Math.PI * f0b) / sampleRate);
  const den2 = 1 + k2 / q2 + k2 * k2;
  const stage2: BiquadCoeffs = {
    b0: 1,
    b1: -2,
    b2: 1,
    a1: (2 * (k2 * k2 - 1)) / den2,
    a2: (1 - k2 / q2 + k2 * k2) / den2,
  };

  return { stage1, stage2 };
}

/** 単一 biquad をサンプル列に適用 (transposed direct-form II)。 */
function applyBiquad(samples: Float32Array, c: BiquadCoeffs): Float32Array {
  const out = new Float32Array(samples.length);
  let z1 = 0;
  let z2 = 0;
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = c.b0 * x + z1;
    z1 = c.b1 * x - c.a1 * y + z2;
    z2 = c.b2 * x - c.a2 * y;
    out[i] = y;
  }
  return out;
}

/** K-weighting (stage1 → stage2) を適用する。 */
export function applyKWeighting(samples: Float32Array, sampleRate: number): Float32Array {
  const c = kWeightingCoeffs(sampleRate);
  return applyBiquad(applyBiquad(samples, c.stage1), c.stage2);
}

/** Alias for {@link applyKWeighting}. */
export const kWeightChannel = applyKWeighting;

// ============================================================
// Block energy (channel-weighted mean square)
// ============================================================

/** z をラウドネス(LUFS)へ変換。z<=0 は -Infinity。 */
function loudnessFromZ(z: number): number {
  return z > 0 ? ABS_OFFSET + 10 * Math.log10(z) : -Infinity;
}

/**
 * K-weighting 済みチャンネル列から、窓ごとの channel-weighted 平均二乗 z を返す。
 * windowSec の窓を hopSec ステップでスライド。
 */
function blockEnergies(
  weightedChannels: Float32Array[],
  params: { sampleRate: number; windowSec: number; hopSec: number }
): number[] {
  const { sampleRate, windowSec, hopSec } = params;
  const n = weightedChannels[0]?.length ?? 0;
  const windowSize = Math.max(1, Math.round(windowSec * sampleRate));
  const hop = Math.max(1, Math.round(hopSec * sampleRate));
  const out: number[] = [];
  if (n < windowSize) return out;
  for (let start = 0; start + windowSize <= n; start += hop) {
    let z = 0;
    for (let ch = 0; ch < weightedChannels.length; ch++) {
      const w = channelWeight(ch);
      if (w === 0) continue;
      const data = weightedChannels[ch];
      let sq = 0;
      for (let i = start; i < start + windowSize; i++) sq += data[i] * data[i];
      z += w * (sq / windowSize);
    }
    out.push(z);
  }
  return out;
}

/** チャンネル全体の channel-weighted 平均二乗 (窓が取れない短尺用フォールバック)。 */
function overallEnergy(weightedChannels: Float32Array[]): number {
  let z = 0;
  for (let ch = 0; ch < weightedChannels.length; ch++) {
    const w = channelWeight(ch);
    if (w === 0) continue;
    const data = weightedChannels[ch];
    if (data.length === 0) continue;
    let sq = 0;
    for (let i = 0; i < data.length; i++) sq += data[i] * data[i];
    z += w * (sq / data.length);
  }
  return z;
}

// ============================================================
// Gated integrated loudness
// ============================================================

/** ゲーティング積分ラウドネス (絶対 -70 + 相対 relativeGate)。 */
function gatedLoudness(blockZ: number[], relativeGate: number): number {
  const absKept = blockZ.filter((z) => loudnessFromZ(z) >= ABSOLUTE_GATE);
  if (absKept.length === 0) return -Infinity;

  const meanAbs = absKept.reduce((s, z) => s + z, 0) / absKept.length;
  const relThreshold = loudnessFromZ(meanAbs) + relativeGate;

  const relKept = absKept.filter((z) => loudnessFromZ(z) >= relThreshold);
  if (relKept.length === 0) return loudnessFromZ(meanAbs);

  const meanRel = relKept.reduce((s, z) => s + z, 0) / relKept.length;
  return loudnessFromZ(meanRel);
}

/** 窓ラウドネスの最大値 (momentary/short-term メーター用)。 */
function maxWindowLoudness(weightedChannels: Float32Array[], sampleRate: number, windowSec: number): number {
  const energies = blockEnergies(weightedChannels, { sampleRate, windowSec, hopSec: windowSec / 4 });
  if (energies.length === 0) return loudnessFromZ(overallEnergy(weightedChannels));
  let max = -Infinity;
  for (const z of energies) {
    const l = loudnessFromZ(z);
    if (l > max) max = l;
  }
  return max;
}

/** Loudness Range (LRA, EBU Tech 3342): 3s 窓 / 100ms hop, 相対 -20 LU, 10-95 パーセンタイル。 */
function loudnessRange(weightedChannels: Float32Array[], sampleRate: number): number {
  const energies = blockEnergies(weightedChannels, { sampleRate, windowSec: 3.0, hopSec: 0.1 });
  const absKept = energies.filter((z) => loudnessFromZ(z) >= ABSOLUTE_GATE);
  if (absKept.length < 2) return 0;

  const meanAbs = absKept.reduce((s, z) => s + z, 0) / absKept.length;
  const relThreshold = loudnessFromZ(meanAbs) + RELATIVE_GATE_LRA;
  const loud = absKept
    .map(loudnessFromZ)
    .filter((l) => l >= relThreshold)
    .sort((a, b) => a - b);
  if (loud.length < 2) return 0;

  const p10 = loud[Math.floor(loud.length * 0.1)];
  const p95 = loud[Math.min(loud.length - 1, Math.floor(loud.length * 0.95))];
  return Math.max(0, p95 - p10);
}

// ============================================================
// True peak (4x oversampling approximation)
// ============================================================

/** True-peak 4x オーバーサンプリングの sinc 半幅 (タップ数の半分)。 */
const TRUE_PEAK_HALF = 8;
/** True-peak オーバーサンプリング係数 (BS.1770-4 Annex 2 は 4x を規定)。 */
const TRUE_PEAK_OS = 4;

/**
 * Hann 窓付き sinc のタップ重み。窓は [-halfWidth, halfWidth]。
 * 線形補間と違い帯域制限補間は隣接サンプルの絶対値を超える inter-sample 値を
 * 復元できる — これが true-peak の本質。
 */
function sincTap(x: number, halfWidth: number): number {
  if (x === 0) return 1;
  if (Math.abs(x) >= halfWidth) return 0;
  const px = Math.PI * x;
  const sinc = Math.sin(px) / px;
  const hann = 0.5 * (1 + Math.cos((Math.PI * x) / halfWidth));
  return sinc * hann;
}

/**
 * 分数位相 (1/OS, 2/OS, …) ごとの正規化済みポリフェーズ FIR カーネルを生成。
 * 単位 DC ゲインに正規化し、ホットループから三角関数を排除する。
 */
function buildTruePeakKernels(): Float32Array[] {
  const taps = TRUE_PEAK_HALF * 2;
  const kernels: Float32Array[] = [];
  for (let s = 1; s < TRUE_PEAK_OS; s++) {
    const frac = s / TRUE_PEAK_OS;
    const ker = new Float32Array(taps);
    let wsum = 0;
    for (let t = 0; t < taps; t++) {
      const k = t - TRUE_PEAK_HALF + 1; // k ∈ [-HALF+1, HALF]
      const w = sincTap(k - frac, TRUE_PEAK_HALF);
      ker[t] = w;
      wsum += w;
    }
    for (let t = 0; t < taps; t++) ker[t] /= wsum;
    kernels.push(ker);
  }
  return kernels;
}

/** 位相非依存なので一度だけ構築して再利用 (process() 外なので GC 問題なし)。 */
const TRUE_PEAK_KERNELS = buildTruePeakKernels();

/**
 * True Peak (dBTP) を 4x 帯域制限 (windowed-sinc) オーバーサンプリングで近似する。
 *
 * BS.1770-4 Annex 2 は専用 FIR を規定。旧実装は線形補間を用いていたが、線形補間は
 * 2 サンプル間で単調なため |a + (b-a)t| ≤ max(|a|,|b|) となり inter-sample peak を
 * 一切検出できず true-peak がサンプルピークと常に一致していた。帯域制限補間に置換し
 * サンプル間のオーバーシュートを実際に検出する。
 */
function truePeakDbtp(channels: Float32Array[]): number {
  const half = TRUE_PEAK_HALF;
  const taps = half * 2;
  let peak = 0;

  for (const ch of channels) {
    const n = ch.length;
    // 整数位置 (サンプルピーク)。
    for (let i = 0; i < n; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
    // サンプル間の OS-1 個の分数位置。
    for (let phase = 0; phase < TRUE_PEAK_KERNELS.length; phase++) {
      const ker = TRUE_PEAK_KERNELS[phase];
      for (let i = 0; i < n - 1; i++) {
        let acc = 0;
        for (let t = 0; t < taps; t++) {
          const idx = i + (t - half + 1);
          if (idx >= 0 && idx < n) acc += ch[idx] * ker[t];
        }
        const v = acc < 0 ? -acc : acc;
        if (v > peak) peak = v;
      }
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

// ============================================================
// Sample peak
// ============================================================

/** Maximum absolute sample value across all channels, expressed in dBFS. */
function samplePeakDbfs(channels: Float32Array[]): number {
  let peak = 0;
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const a = Math.abs(ch[i]);
      if (a > peak) peak = a;
    }
  }
  return peak > 0 ? 20 * Math.log10(peak) : -Infinity;
}

// ============================================================
// Public: full measurement
// ============================================================

/**
 * チャンネル列 (各 Float32Array) から BS.1770-4 / EBU R128 ラウドネスを測定する。
 * @param channels - 非加重 (raw) のチャンネルサンプル列
 * @param sampleRate - サンプルレート (Hz)
 */
export function measureLoudness(channels: Float32Array[], sampleRate = 48000): LoudnessMeasurement {
  if (channels.length === 0 || (channels[0]?.length ?? 0) === 0) {
    return {
      momentary: -Infinity, shortTerm: -Infinity, integrated: -Infinity,
      range: 0, loudnessRange: 0, truePeak: -Infinity, samplePeak: -Infinity,
    };
  }

  const sp = samplePeakDbfs(channels);

  // True peak は K-weighting *前* の信号で測る (BS.1770-4 Annex 2)。
  const truePeak = truePeakDbtp(channels);

  // 以降の loudness は K-weighting 済み信号で算出。
  const weighted = channels.map((ch) => applyKWeighting(ch, sampleRate));

  const momentaryEnergies = blockEnergies(weighted, { sampleRate, windowSec: 0.4, hopSec: 0.1 });
  const integrated =
    momentaryEnergies.length > 0
      ? gatedLoudness(momentaryEnergies, RELATIVE_GATE_INTEGRATED)
      : loudnessFromZ(overallEnergy(weighted));

  const lra = loudnessRange(weighted, sampleRate);
  return {
    momentary: maxWindowLoudness(weighted, sampleRate, 0.4),
    shortTerm: maxWindowLoudness(weighted, sampleRate, 3.0),
    integrated,
    range: lra,
    loudnessRange: lra,
    truePeak,
    samplePeak: sp,
  };
}

// ============================================================
// Public: streaming meter
// ============================================================

/**
 * Create a stateful streaming loudness meter.
 *
 * Call {@link LoudnessMeter.process} with successive audio blocks (any size).
 * {@link LoudnessMeter.getMeasurement} returns an aggregate over all blocks
 * processed so far. Call {@link LoudnessMeter.reset} to start a new session.
 *
 * @param sampleRate  Sample rate in Hz. Default: 48000.
 */
export function createLoudnessMeter(sampleRate = 48000): LoudnessMeter {
  const blocks: Array<Float32Array[]> = [];
  let numChannels = 0;
  let runningPeak = 0;

  function process(channels: Float32Array[]): void {
    if (channels.length === 0) return;
    if (numChannels === 0) numChannels = channels.length;
    blocks.push(channels.map((ch) => ch.slice()));
    for (const ch of channels) {
      for (let i = 0; i < ch.length; i++) {
        const a = Math.abs(ch[i]);
        if (a > runningPeak) runningPeak = a;
      }
    }
  }

  function getMeasurement(): LoudnessMeasurement {
    const empty: LoudnessMeasurement = {
      momentary: -Infinity, shortTerm: -Infinity, integrated: -Infinity,
      range: 0, loudnessRange: 0, truePeak: -Infinity, samplePeak: -Infinity,
    };
    if (blocks.length === 0 || numChannels === 0) return empty;

    // Concatenate stored blocks into full-length per-channel arrays
    const merged: Float32Array[] = [];
    for (let c = 0; c < numChannels; c++) {
      const parts = blocks.filter((blk) => c < blk.length).map((blk) => blk[c]);
      const total = parts.reduce((s, p) => s + p.length, 0);
      const data  = new Float32Array(total);
      let off = 0;
      for (const p of parts) { data.set(p, off); off += p.length; }
      merged.push(data);
    }

    const m = measureLoudness(merged, sampleRate);
    return { ...m, samplePeak: runningPeak > 0 ? 20 * Math.log10(runningPeak) : -Infinity };
  }

  function reset(): void {
    blocks.length = 0;
    numChannels   = 0;
    runningPeak   = 0;
  }

  return { process, getMeasurement, reset };
}

// ============================================================
// Public: auto-ducking
// ============================================================

/** ms 時定数を一次フィルタ係数へ変換。 */
function timeConstant(ms: number, sampleRate: number): number {
  if (ms <= 0) return 0;
  return Math.exp(-1 / ((ms / 1000) * sampleRate));
}

/**
 * サイドチェーン(セリフ)に応じて BGM を減衰させるゲイン包絡を生成する純関数。
 * 返り値は music と同じ長さの線形ゲイン (0..1) 配列。
 *
 * @param music - 対象 (BGM) サンプル — 長さの基準
 * @param sidechain - 検出元 (セリフ等) サンプル
 * @param options - 閾値/減衰量/アタック/リリース
 */
export function computeDuckingGain(
  music: Float32Array,
  sidechain: Float32Array,
  options: DuckingOptions
): Float32Array {
  const { sampleRate } = options;
  const thresholdDb = options.thresholdDb ?? -30;
  const duckDb = options.duckDb ?? -12;
  const attack = timeConstant(options.attackMs ?? 50, sampleRate);
  const release = timeConstant(options.releaseMs ?? 300, sampleRate);

  // サイドチェーン用エンベロープフォロワ (高速アタック/中速リリース)。
  const envAtk = timeConstant(5, sampleRate);
  const envRel = timeConstant(100, sampleRate);

  const gain = new Float32Array(music.length);
  let env = 0;
  let gDb = 0; // 現在のゲイン (dB)。0 = 非ダッキング、duckDb まで下降。
  for (let i = 0; i < music.length; i++) {
    const sc = i < sidechain.length ? Math.abs(sidechain[i]) : 0;
    const ec = sc > env ? envAtk : envRel;
    env = sc + (env - sc) * ec;

    const envDb = env > 1e-7 ? 20 * Math.log10(env) : -Infinity;
    const target = envDb > thresholdDb ? duckDb : 0;
    // ダッキングへ入る (target<gDb) ときは attack、戻るときは release。
    const coeff = target < gDb ? attack : release;
    gDb = target + (gDb - target) * coeff;
    gain[i] = Math.pow(10, gDb / 20);
  }
  return gain;
}
