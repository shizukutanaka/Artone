/**
 * Artone v3 — Audio Sync (normalized cross-correlation)
 *
 * マルチカム/複数アングルのクリップを、共通音声の相互相関で整列するための純関数。
 * `multicam-editor.ts` の擬似 (Math.random) offset 算出を置き換える。
 *
 * 規約: target[i] = reference[i - D] (target が D サンプル遅延) のとき offsetSamples = +D。
 *       すなわち正の offset = target が reference より遅れている量。
 *
 * 設計根拠: 正規化相互相関 (NCC) によるラグ推定。長尺はダウンサンプルで O を抑制。
 * @version 1.0.0
 */

/** PCM サンプルとサンプルレートの組。 */
export interface AudioSamples {
  samples: Float32Array;
  sampleRate: number;
}

/** 相互相関による同期結果。 */
export interface SyncOffset {
  /** reference に対する target の遅延 (サンプル数, reference のレート基準)。 */
  offsetSamples: number;
  /** 同上 (秒)。 */
  offsetSec: number;
  /** 正規化相関のピーク値 (0..1)。整列の信頼度。 */
  confidence: number;
}

/** 相互相関のオプション。 */
export interface CrossCorrelationOptions {
  sampleRate: number;
  /** 探索する最大ラグ (秒)。既定 2.0。 */
  maxLagSec?: number;
  /** 計算量削減のための間引き係数 (>=1)。既定 1。 */
  downsample?: number;
}

/** 整数係数で間引く (アンチエイリアスは省略 — 粗探索用)。 */
function decimate(x: Float32Array, factor: number): Float32Array {
  if (factor <= 1) return x;
  const n = Math.floor(x.length / factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = x[i * factor];
  return out;
}

/**
 * reference と target の正規化相互相関でラグ (offset) を推定する。
 * @returns 信頼度付きの同期オフセット。十分な重なりが無い場合は offset 0 / confidence 0。
 */
export function crossCorrelationOffset(
  reference: Float32Array,
  target: Float32Array,
  options: CrossCorrelationOptions
): SyncOffset {
  const { sampleRate } = options;
  const maxLagSec = options.maxLagSec ?? 2.0;
  const ds = Math.max(1, Math.floor(options.downsample ?? 1));

  const ref = decimate(reference, ds);
  const tgt = decimate(target, ds);
  const effRate = sampleRate / ds;

  const shortest = Math.min(ref.length, tgt.length);
  if (shortest < 2) return { offsetSamples: 0, offsetSec: 0, confidence: 0 };

  const maxLag = Math.min(Math.floor(maxLagSec * effRate), shortest - 1);
  const minOverlap = Math.max(2, Math.floor(shortest / 2));

  let bestLag = 0;
  let bestScore = -Infinity;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const iStart = Math.max(0, -lag);
    const iEnd = Math.min(ref.length, tgt.length - lag);
    if (iEnd - iStart < minOverlap) continue;

    let dot = 0;
    let energyRef = 0;
    let energyTgt = 0;
    for (let i = iStart; i < iEnd; i++) {
      const a = ref[i];
      const b = tgt[i + lag];
      dot += a * b;
      energyRef += a * a;
      energyTgt += b * b;
    }
    const norm = Math.sqrt(energyRef * energyTgt);
    const score = norm > 0 ? dot / norm : 0;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  const offsetSamples = bestLag * ds;
  return {
    offsetSamples,
    offsetSec: offsetSamples / sampleRate,
    confidence: Math.max(0, Math.min(1, bestScore)),
  };
}

/**
 * 基準アングルに対する各アングルの同期オフセット (秒) を算出する。
 * @param reference - 基準アングルの音声
 * @param angles - { id, audio } の配列 (reference も含めてよい)
 * @param referenceId - 基準アングルの id
 * @returns id → offsetSec のマップ。基準は 0。レート不一致/音声欠落は 0。
 */
export function alignAnglesByAudio(
  reference: AudioSamples,
  angles: Array<{ id: string; audio?: AudioSamples }>,
  referenceId: string
): Map<string, number> {
  const offsets = new Map<string, number>();
  for (const angle of angles) {
    if (angle.id === referenceId) {
      offsets.set(angle.id, 0);
      continue;
    }
    if (!angle.audio || angle.audio.sampleRate !== reference.sampleRate) {
      offsets.set(angle.id, 0);
      continue;
    }
    const result = crossCorrelationOffset(reference.samples, angle.audio.samples, {
      sampleRate: reference.sampleRate,
    });
    offsets.set(angle.id, result.offsetSec);
  }
  return offsets;
}
