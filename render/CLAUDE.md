# render/ — GPU リソース管理ゾーン

## 厳守事項
- すべての GPUBuffer / GPUTexture は `destroy()` 必須
- レンダリングループ内で resource 作成禁止 (事前確保)
- BindGroup は再利用 (フレームごと再作成回避)
- 60fps 維持: フレーム予算 16.67ms

## メモリリーク防止
- 全 GPU リソースは pool 経由で管理
- WeakRef + FinalizationRegistry で leak 検出
- destroy 漏れは development build で warn

## シェーダー
- WGSL のみ使用 (GLSL 互換ラッパーは禁止)
- すべてのシェーダーに workgroup_size 明示
- precision はデフォルト f32 (f16 は明示時のみ)

## フォールバック
- WebGPU 未対応時は WebGL2 フォールバック必須
- WebGL2 未対応時は WebCodecs SoftwareDecoder
- 全パスがソフトウェアレンダリングで動作可能

## テスト要求
- カバレッジ 90%+
- メモリリークテスト (1時間連続レンダリング)
- 各 GPU ベンダー (NVIDIA/AMD/Intel/Apple) で動作確認
- frametime variance < 2ms


## 新規モジュール (2026-05, arXiv知見ベース)
- `webgl-fallback.ts` — WebGPU非対応環境のWebGL 2.0レンダラ。WebGPURenderEngineと同じRenderLayer IFを実装 (Strategyパターン)。texImage2DでGPU-to-CPUコピー回避。
- `frame-cache.ts` — 3層フレームキャッシュ (hot/warm/sink)。byteiota(300 GPU+900 RAM)+LongLive(frame-sink rolling eviction)。即時スクラビング。VideoFrame.close()でメモリ明示解放。

## 設計根拠 (References)
- webrtcHacks/W3C Media WG: WebGL 2.0のVideoFrame処理性能はWebGPUと同等。GPU-to-CPUコピーは最大1回。
- LoopDesk: WebGPU非対応時のWebGLフォールバック必須 (Firefox 116+はフラグ)。
- byteiota/MASterSelects: 3層キャッシュで即時スクラビング。
- LongLive (arXiv 2509.22622): frame-sink + 短窓rolling evictionでpeak memory -17%。
