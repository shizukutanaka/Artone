/**
 * Artone v3 — Render Bundle Cache
 *
 * WebGPU Render Bundle の再記録判定を管理する。
 *
 * 設計根拠 (W3C WebGPU / Toji.dev / MDN):
 * - Render Bundle は事前記録したコマンド列を executeBundles() で再利用し、
 *   JS draw-call オーバーヘッドを削減する (40k オブジェクトで顕著)。
 * - 作成時に検証を済ませるため実行時検証をスキップでき高速。
 * - 「同じ方法で描画されるバッチ」に最適。content (uniform) だけが変わるケース。
 *
 * このモジュールは GPU API を直接触らず、「いつ bundle を再記録すべきか」の
 * 判定ロジック (バッチキー生成 + 無効化) を純粋に扱う。
 * GPU 部分は webgpu-engine が GPURenderBundleEncoder で実装する。
 */

export interface BatchSignature {
  /** パイプライン識別 (blend mode + effect chain) */
  pipelineKey: string;
  /** 描画対象レイヤー数 */
  layerCount: number;
  /** 頂点バッファ/インデックスバッファのレイアウト識別 */
  bufferLayoutKey: string;
}

/**
 * レイヤー群から bundle の再記録が必要かを判定するキャッシュ。
 * 同一シグネチャなら既存 bundle を再利用 (executeBundles)。
 */
export class RenderBundleCache {
  private currentSignature: string | null = null;
  private bundleValid = false;
  private recordCount = 0;
  private reuseCount = 0;

  /**
   * バッチシグネチャを文字列キーに変換 (決定的)。
   */
  static signatureKey(sig: BatchSignature): string {
    return `${sig.pipelineKey}|${sig.layerCount}|${sig.bufferLayoutKey}`;
  }

  /**
   * 新しいフレームのシグネチャを受け取り、bundle 再記録が必要か返す。
   * - シグネチャが変わった → 再記録必要 (true)
   * - 同一 → 既存 bundle 再利用 (false)
   */
  needsRerecord(sig: BatchSignature): boolean {
    const key = RenderBundleCache.signatureKey(sig);
    if (key !== this.currentSignature || !this.bundleValid) {
      this.currentSignature = key;
      this.bundleValid = true;
      this.recordCount++;
      return true;
    }
    this.reuseCount++;
    return false;
  }

  /**
   * 明示的に bundle を無効化 (エフェクト追加/レイヤー構成変更時)。
   * 次の needsRerecord で必ず再記録される。
   */
  invalidate(): void {
    this.bundleValid = false;
  }

  getStats() {
    const total = this.recordCount + this.reuseCount;
    return {
      recordCount: this.recordCount,
      reuseCount: this.reuseCount,
      /** 再利用率 — 高いほど draw-call 削減効果が大きい */
      reuseRate: total > 0 ? this.reuseCount / total : 0,
    };
  }

  reset(): void {
    this.currentSignature = null;
    this.bundleValid = false;
    this.recordCount = 0;
    this.reuseCount = 0;
  }
}
