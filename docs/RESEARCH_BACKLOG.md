# Artone カテゴリ別 研究バックログ（arXiv + GitHub）

> 作成日: 2026-06-05 / `/loop` 由来。Artone を **10カテゴリ**に分解し、各カテゴリで
> arXiv 論文・GitHub プロジェクト・業界標準から関連情報を収集、改善点を洗い出す。
> 前提: 100%ローカル / サーバーレス / Web標準のみ（クラウド依存策は対象外）。
> 補完資料: `docs/IMPROVEMENTS.md`（競合NLE比較 + 優先度ロードマップ）。

---

## 1. コーデック & コンテナ基盤 — `core/` `interchange/`
**現状**: `webcodecs-pipeline.ts` / `codec-router.ts`。WebCodecs 依存、ProRes/DNxHD 未対応。

**ソース**
- Mediabunny — ゼロ依存TS媒体ツールキット（10,800 pkt/s vs ffmpeg.wasm 1.83）: https://github.com/Vanilagy/mediabunny
- mp4-muxer（mediabunnyへ統合）: https://github.com/Vanilagy/mp4-muxer
- WebCodecs API（MDN）: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- WebCodecs (De)Muxing API 議論 #35: https://github.com/w3c/media-production-workshop/issues/35
- DCVC-RT 実時間ニューラル圧縮（125/112fps・-21% vs H.266）: https://arxiv.org/html/2502.20762v1
- 階層予測ニューラル圧縮: https://arxiv.org/pdf/2410.02598
- 低解像度表現学習による高速化: https://arxiv.org/pdf/2407.16418
- 統合 Intra/Inter 実時間圧縮: https://arxiv.org/html/2510.14431v5
- 従来/学習型コーデック低遅延ベンチ: https://arxiv.org/html/2408.05042v1
- ELF-VC 可変レート: https://arxiv.org/pdf/2104.14335

**改善点**
- [P1] muxer/demuxer を mediabunny 流のゼロ依存・tree-shakable 設計へ寄せ、対応コンテナ拡大（.mkv/.ts/.flac/.aac）。
- [P2] ProRes/DNxHD の WASM デコード fallback（業界共通の WebCodecs 限界への現実解）。
- [P2] 学習型コーデック（DCVC-RT は復号112fps）をプロキシ/プレビュー専用に評価。

## 2. GPUレンダリング & プレビュー — `render/`
**現状**: `webgpu-engine.ts` / `webgl-fallback.ts` / `render-bundle-cache.ts` / `frame-cache.ts`。

**ソース**
- awesome-webgpu: https://github.com/mikbry/awesome-webgpu
- gpu-curtains（compute/render bundles/instancing）: https://martinlaxenaire.github.io/gpu-curtains/
- WebGPU 仕様（W3C）: https://www.w3.org/TR/webgpu/
- YouTube VSR（WGSL shader parser, color/upscale/denoise）: ブラウザ拡張の実装例
- learn-wgpu: https://sotrh.github.io/learn-wgpu/
- Real-time Tone Mapping SOTA（50+アルゴ）: https://arxiv.org/abs/2003.03074
- Real-time tone mapping GPU/FPGA: https://jivp-eurasipjournals.springeropen.com/articles/10.1186/1687-5281-2012-1
- WebCodecs dual-GPU コピー問題 #873: https://github.com/w3c/webcodecs/issues/873
- ESPCN sub-pixel SR: https://arxiv.org/abs/1609.05158

**改善点**
- [P0] `VideoFrame→importExternalTexture` ゼロコピーで dual-GPU の CPU↔GPU 余分コピー排除。
- [P1] WGSL compute による tone mapping を複数アルゴ（reinhard/aces/filmic/hable…）から選択可能化。
- [P1] WebGL fallback の機能パリティ監査（destroy 漏れ・カラーパイプライン一致）。

## 3. ローカルAI推論基盤 — `ai/`
**現状**: `ai-effects-engine.ts` の `loadModel` は擬似ロード。実推論バックエンド未接続。

**ソース**
- Transformers.js v3（WebGPU・3-10x vs WASM）: https://github.com/huggingface/transformers.js/
- Transformers.js v3 解説: https://huggingface.co/blog/transformersjs-v3
- ONNX Runtime Web（WebGPU EP, 1.17+）: https://onnxruntime.ai/docs/tutorials/web/ep-webgpu.html
- WebLLM（MLC, WebGPU, OpenAI互換API）: ブラウザ内LLM
- browser-llm-webgpu PoC: https://github.com/hannes-sistemica/browser-llm-webgpu
- Whisper 量子化（INT4/5/8）: https://arxiv.org/abs/2503.09905
- ストリーミング Whisper 二段デコード: https://arxiv.org/pdf/2506.12154
- On-device ストリーミング ASR（<1GB, CPU実時間超）: https://arxiv.org/abs/2604.14493
- 拡散量子化 TQ-DiT（W8A8/W6A6）: https://arxiv.org/pdf/2502.04056
- Modulated Diffusion 加速: https://arxiv.org/pdf/2506.22463

**改善点**
- [P0] 実バックエンド接続（Transformers.js + ONNX RT Web WebGPU EP）、モデルは OPFS キャッシュ配信。
- [P1] Worker + Comlink でメインスレッド非ブロッキング推論（audio/render の60fpsを阻害しない）。
- [P1] 量子化既定の確定（q4/q8 を端末別ベンチで自動選択）、WebGPU非対応端末は<1GB CPUモデル fallback。

## 4. AI動画機能 — `ai/` `captions/`
**現状**: SAM2/ESRGAN/Whisper/BodyPix を*登録のみ*。captions は ASR 未連携。

**ソース**
- SAM2（動画mask伝播・コード内既参照）: https://arxiv.org/abs/2408.00714
- Efficient Track Anything（iPhone 10fps VOS）: https://arxiv.org/pdf/2411.18933
- Efficient-SAM2（object-aware encoding）: https://arxiv.org/html/2602.08224
- Segment and Matte Anything 統合（髪/半透明 alpha）: https://arxiv.org/html/2601.12147v1
- SAM for Video 総説: https://arxiv.org/pdf/2507.22792
- 動画SR（AIM2024・AV1圧縮素材）: https://arxiv.org/html/2409.17256v1/
- 時空間SR + フレーム補間: https://arxiv.org/pdf/2104.05778
- ESRGAN/ESPCN: https://arxiv.org/abs/1609.05158

**改善点**
- [P0] captions ← Whisper 配線で自動字幕 → `text-based-editing` 一気通貫（Descript級・最高ROI）。
- [P0] EfficientTAM で object mask 伝播（Magic Mask 対抗、モバイル10fps 実用域）。
- [P1] Segment+Matte 統合で背景除去の縁品質改善。ESRGAN 実装昇格。outpaint で Generative Extend。

## 5. タイムライン編集 & ワークフロー — `timeline/` `interchange/`
**現状**: マグネティック/マルチカム/ネスト/マーカー/テキストベース編集 実装済。OTIO/EDL/FCPXML 互換。

**ソース**
- OpenTimelineIO（ASWF 標準）: https://github.com/AcademySoftwareFoundation/OpenTimelineIO
- OTIO の Effects 議論 #921: https://github.com/AcademySoftwareFoundation/OpenTimelineIO/discussions/921
- omniclip（ブラウザ編集・privacy）: https://github.com/omni-media/omniclip
- OpenReel Video（React+WebCodecs+WebGPU）: https://github.com/Augani/openreel-video
- voidcut（ブラウザ NLE）: https://github.com/timii/voidcut
- olive-editor（OSS NLE）: https://github.com/olive-editor/olive
- kdenlive（MLT）: https://github.com/kde/kdenlive
- OTIO quickstart: https://github.com/AcademySoftwareFoundation/OpenTimelineIO/blob/main/docs/tutorials/quickstart.md

**改善点**
- [P1] OTIO は effects/transitions/retiming が tool-specific → Artone 往復で構造保持・損失箇所の明示ログ。
- [P2] 脚本→ラフカット自動生成（WebLLM + テキストベース編集）。
- [P2] マルチカム/ネストの OTIO マッピング検証スイート（往復差分テスト）。

## 6. カラーサイエンス — `color/` `scopes/`
**現状**: `grading-engine` / `hdr-engine`（ACESトーンマップ） / `lut-manager`。scopes 実装済。

**ソース**
- OpenColorIO / ACES（After Effects）: https://helpx.adobe.com/after-effects/using/opencolorio-aces-color-management.html
- ACES（Academy Color Encoding System）: 業界標準
- Real-time Tone Mapping SOTA: https://arxiv.org/abs/2003.03074
- tone mapping GPU/FPGA: https://jivp-eurasipjournals.springeropen.com/articles/10.1186/1687-5281-2012-1
- DaVinci カラー: 業界リファレンス

**改善点**
- [P1] ACEScg ワーキングスペース + IDT/ODT（OCIO準拠）で業界往復（DaVinci/AE）。
- [P2] scopes に false color / CIE chromaticity 追加。
- [P2] HDR は HDR10/HLG（既存）+ Dolby Vision メタデータ往復。

## 7. オーディオエンジン — `audio/`
**現状**: `audio-engine`（noise-reduction は簡易ゲート） / `surround-audio`。VST/AU ブリッジ。

**ソース**
- RNNoise WASM（AudioWorklet, 480-sample, GCなし）: https://github.com/jitsi/rnnoise-wasm
- RNNoise WASM（shiguredo）: https://github.com/shiguredo/rnnoise-wasm
- Wasm Audio Worklets（Emscripten・GCなし）: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
- 実時間音楽分離 RT-STT: https://arxiv.org/abs/2511.13146
- 軽量分離 DTTNet: https://arxiv.org/abs/2309.08684
- 伴奏分離 MMDenseNet: https://arxiv.org/pdf/2407.00657
- 軽量音声強調 Reverse Attention: https://arxiv.org/pdf/2509.16705
- サブミリ秒音声強調（626k）: https://arxiv.org/html/2409.18239v2
- EBU R128 ラウドネス（-23 LUFS）: https://tech.ebu.ch/docs/r/r128.pdf
- EBU R128 s4（dialogue ratio）: https://tech.ebu.ch/publications/r128s4

**改善点**
- [P1] 簡易ゲート → RNNoise WASM（AudioWorklet, GCなし）でニューラルノイズ除去。
- [P1] ソース分離（ボーカル/伴奏ステム, RT-STT 量子化）を新規追加。
- [P1] EBU R128 ラウドネスメーター + 自動ダッキング（dialogue-to-loudness ratio 基準）。

## 8. 協調編集 & データ永続化 — `collab/` `project/` `recovery/`
**現状**: Yjs。`project-manager`（IndexedDB）。`recovery-manager`。

**ソース**
- Yjs（26K–156K ops/s）: 現状採用
- Eg-walker（Better/Faster/Smaller, EuroSys'25）: https://arxiv.org/pdf/2409.14252
- Collabs CRDT フレームワーク: https://arxiv.org/pdf/2212.02618
- Collaborative editing + AI agents: https://arxiv.org/html/2509.11826v1
- OPFS（3-4x vs IndexedDB, in-place write）: https://renderlog.in/blog/origin-private-file-system-opfs/
- RxDB OPFS storage（~4x）: https://rxdb.info/rx-storage-opfs.html
- IndexedDB 遅延の解説: https://rxdb.info/slow-indexeddb.html
- ストレージ比較（OPFS/IDB/SQLite-WASM）: https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html

**改善点**
- [P1] プロジェクト/メディア永続化を IndexedDB → OPFS（3-4x, 300MB+, in-place write）。
- [P2] Eg-walker 採否を技術メモ化（長尺タイムラインのメモリ/起動時間）。
- [P2] CRDT をマーカー/字幕/コメントに拡張。AIエージェント協調編集の評価。

## 9. 拡張性 & プラグイン — `plugins/`
**現状**: `plugin-manager` / `plugin-bridge`。WASM サンドボックス + VST/AU ブリッジ。

**ソース**
- Extism（wasm プラグインフレームワーク）: https://github.com/extism/extism
- WebAssembly Component Model（WIT, sandbox）: https://dev.to/topheman/webassembly-component-model-building-a-plugin-system-58o0
- wasm-audio-examples（wasm component audio plugin）: https://github.com/wasm-audio/wasm-audio-examples
- Wasm Audio Worklets（Emscripten）: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
- WASI Preview 2 現況: https://eunomia.dev/blog/2025/02/16/wasi-and-the-webassembly-component-model-current-status/
- WebAssembly and Security 総説（121論文）: https://arxiv.org/abs/2407.12297
- WebAssembly Runtimes 総説: https://arxiv.org/html/2404.12621v1

**改善点**
- [P1] プラグインABIを Component Model / WIT で定義し10年安定互換を担保。
- [P1] capability-secure サンドボックス（WASI Preview 2）監査を `security/` 連携で実施（2407.12297 のカテゴリ準拠）。
- [P2] VST/AU を Wasm Audio Worklet 経路に（GCなし・リアルタイム制約）。

## 10. パフォーマンス・信頼性・PWA — `perf/` `media/` `recovery/`
**現状**: `performance-monitor`（自動品質） / `proxy-workflow` / `recovery-manager` / sw.js（PWA）。

**ソース**
- OPFS（in-place write, 3-4x）: https://renderlog.in/blog/origin-private-file-system-opfs/
- RxDB IndexedDB slowness: https://rxdb.info/slow-indexeddb.html
- WebCodecs dual-GPU コピー #873: https://github.com/w3c/webcodecs/issues/873
- Mediabunny ベンチ（804 fps 変換 vs ffmpeg.wasm 12）: https://github.com/Vanilagy/mediabunny
- WASM 90-95% native: https://byteiota.com/browser-video-editing-webgpu-wasm-performance/
- ブラウザストレージ比較: https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html

**改善点**
- [P1] プロキシ/メディア/プロジェクトを OPFS in-place write へ（リカバリは write-then-rename を維持）。
- [P1] `performance-monitor` に dual-GPU 検出を追加し自動品質と連動。
- [P2] プロキシ生成を WebCodecs（mediabunny 流）で高速化、長尺プロジェクトの書き出しキュー化。

---

## 横断サマリ（最優先で着手すべき改善）
1. **AI実バックエンド接続 + captions←Whisper 自動字幕**（カテゴリ3・4）— scaffold 完成で Descript 級体験。
2. **VideoFrame→WebGPU ゼロコピー**（カテゴリ2・10）— 全プレビュー/エフェクトの土台性能。
3. **OPFS 永続化移行**（カテゴリ8・10）— 大容量プロジェクトの読み書き 3-4x。
4. **RNNoise + ラウドネス/ダッキング**（カテゴリ7）— プロ音声品質の即効改善。
5. **ACES カラーマネジメント・OTIO 往復強化**（カテゴリ5・6）— 業界互換の信頼性。

> 各改善は CLAUDE.md のワークフロー（要件→既存確認→設計→実装→テスト[リスクゾーン95%+]→ドキュメント）で個別 PR 化する。
