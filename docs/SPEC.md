# Artone 仕様書 (SPEC) と実装ギャップ

> 作成日: 2026-06-05。各モジュールの**あるべき仕様**を定義し、実装状況を突き合わせて
> **不足部分 (gap)** を一覧化する。`docs/IMPROVEMENTS.md`(競合比較)・`docs/RESEARCH_BACKLOG.md`
> (研究ベース)を、コードの実地監査で裏付けるのが本書の役割。
>
> ステータス凡例: ✅実装済 / 🟡部分・簡易 / 🟥scaffold(宣言のみ) / 🎲擬似(Math.random等)

## 0. 製品要件 (WHY)
ブラウザ完結のプロ動画エディタ。100%ローカルAI・サーバーレス・インストール不要。
Web標準 (WebCodecs/WebGPU/WebAssembly) のみ依存。10年運用・データ主権ユーザー側。

## 1. モジュール仕様と状況

| モジュール | 主責務 / 主要API | 状況 | 備考 |
|---|---|---|---|
| `core/` | WebCodecs デコード/エンコード、codec routing | ✅ | `webcodecs-pipeline` / `codec-router` |
| `render/` | WebGPU 60fps プレビュー、WebGL fallback、frame cache | ✅ | `color/grading` の GPU 適用は 🟡 (下記) |
| `timeline/` | マグネティック/マルチカム/ネスト/マーカー/テキスト編集 | ✅ | マルチカム音声同期は 🎲 (下記) |
| `color/` | グレーディング、HDR、LUT | 🟡 | `grading-engine` の GPU 経路は未実装コメント |
| `audio/` | ミキサー、EQ/Comp、ラウドネス、サラウンド、VST | 🟡 | ラウドネス✅(実装済)、ch メーターは 🎲 (下記) |
| `ai/` | ローカル推論 (ASR/segmentation/upscale) | 🟥 | `loadModel` は擬似ロード、`transcribe` 不在 |
| `export/` | 8プリセット書き出し、muxing | 🟡 | muxing は "Placeholder: empty blob" |
| `animation/` | キーフレーム、モーショングラフィックス | ✅ | |
| `captions/` | 字幕 import/render (SRT/VTT/ASS) | 🟡 | 自動字幕(ASR連携)が不在 |
| `collab/` | Yjs 協調編集 | ✅ | |
| `plugins/` | WASM プラグインホスト + VST/AU | ✅ | ABI 安定化は将来 |
| `undo/` | Command Pattern 履歴 | ✅ | |
| `scopes/` | Waveform/Vectorscope/Histogram | ✅ | |
| `perf/` | パフォーマンス監視、自動品質 | ✅ | dual-GPU 検出は将来 |
| `recovery/` | クラッシュリカバリ、自動バックアップ | ✅ | |
| `media/` | メディアブラウザ、プロキシ生成 | 🟡 | プロキシ encode は "Simulate" |
| `project/` | 永続化 (IndexedDB) | ✅ | OPFS 移行は将来 |
| `interchange/` | OTIO/EDL/FCPXML 互換 | ✅ | AAF は簡易 |
| `accessibility/` | WCAG 2.1 AAA 監査 | ✅ | alpha 合成は将来 |
| `security/` | SBOM、CVE スキャン | ✅ | CVE DB は簡易ローカル |
| `i18n/` | 11言語、ICU 複数形 | ✅ | |
| `install/` | OS判定インストーラ | ✅ | |
| `app/` | React UI、デザインシステム | ✅ | export/import は engine 依存 |

## 2. 不足部分 (GAP) 一覧

| # | Gap | 箇所 | 状況 | 対応 |
|---|---|---|---|---|
| G1 | マルチカム音声同期が乱数で offset を捏造 | `timeline/multicam-editor.ts:156` | 🎲 | **本PRで実装** (相互相関) |
| G2 | サラウンド ch レベルメーターが乱数を返す | `audio/surround-audio.ts:442` | 🎲 | **本PRで実装** (実RMS) |
| G3 | 自動字幕 (ASR→captions) 不在、`transcribe` 無し | `ai/`, `captions/` | ✅ | **実装済** (注入可能 recognizer + importFromTranscription) |
| G4 | AI `loadModel` が擬似、推論バックエンド未接続 | `ai/ai-effects-engine.ts:140` | 🟥 | 次PR (Transformers.js/ONNX) |
| G5 | 書き出し muxing が空 blob を返す | `export/export-engine.ts:529` | 🟡 | 次PR (mediabunny 流 muxer) |
| G6 | プロキシ encode が擬似 (固定 10MB) | `media/proxy-manager.ts:192` | 🟡 | 次PR (WebCodecs) |
| G7 | グレーディング GPU 適用が未実装コメント | `color/grading-engine.ts:468` | 🟡 | 次PR (WGSL compute) |
| G8 | 顔検出が mock を返す | `ai/ai-effects-engine.ts:314` | 🟥 | G4 と同時 |

**本PRのスコープ**: G1・G2 — 「production コードの `Math.random()` 擬似処理を実 DSP に置換」。
いずれも純ロジックで完全にユニットテスト可能。残りは後続 PR で順次。

## 3. 受け入れ基準 (本PR)
- G1: 既知の遅延を与えた2信号から相互相関で offset を ±1サンプル精度で復元。基準アングルは offset=0。
- G2: 既知振幅の各チャンネルから RMS を決定論的に算出 (乱数排除)。buffer 未指定は 0。
- 全ゲート (tsc 0 / eslint 0 / design-system 10/10 / build OK / 全テスト pass) を維持。
