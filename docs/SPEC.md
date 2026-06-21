# Artone 仕様書 (SPEC) と実装ギャップ

> 作成日: 2026-06-05 / 更新: 2026-06-21。各モジュールの**あるべき仕様**を定義し、実装状況を突き合わせて
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
| `export/` | 8プリセット書き出し、muxing | ✅ | MP4 (ISOBMFF) / WebM / WAV / GIF muxer 実装済 |
| `animation/` | キーフレーム、モーショングラフィックス | ✅ | |
| `captions/` | 字幕 import/render (SRT/VTT/ASS) | 🟡 | 自動字幕(ASR連携)が不在 |
| `collab/` | Yjs 協調編集 | ✅ | |
| `plugins/` | WASM プラグインホスト + VST/AU | ✅ | ABI 安定化は将来 |
| `undo/` | Command Pattern 履歴 | ✅ | |
| `scopes/` | Waveform/Vectorscope/Histogram | ✅ | |
| `perf/` | パフォーマンス監視、自動品質 | ✅ | dual-GPU 検出は将来 |
| `recovery/` | クラッシュリカバリ、自動バックアップ | ✅ | |
| `media/` | メディアブラウザ、プロキシ生成 | 🟡 | サイズ推定は実装済 (`estimateProxySize`)。実 encode は次PR |
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
| G1 | マルチカム音声同期が乱数で offset を捏造 | `timeline/multicam-editor.ts:156` | ✅ | **実装済** (相互相関 `timeline/audio-sync.ts`) |
| G2 | サラウンド ch レベルメーターが乱数を返す | `audio/surround-audio.ts:442` | ✅ | **実装済** (実RMS) |
| G3 | 自動字幕 (ASR→captions) 不在、`transcribe` 無し | `ai/`, `captions/` | ✅ | **実装済** (注入可能 recognizer + importFromTranscription + broadcast-spec readability normalization) |
| G4 | AI `loadModel` が擬似、推論バックエンド未接続 | `ai/ai-effects-engine.ts:197` | 🟥 | 次PR (Transformers.js/ONNX) |
| G5 | 書き出し muxing が空 blob を返す | `export/export-engine.ts` | ✅ | **実装済** — MP4 (`export/mp4-muxer.ts` ISOBMFF) + WebM (`export/webm-muxer.ts`) + WAV/GIF。fps≤0 ガード追加済 |
| G6 | プロキシ encode が擬似 (固定 10MB) | `media/proxy-manager.ts:216` | 🟡 | **本PRでサイズ推定を実装** (`estimateProxySize` ビットレートモデル + 決定論ハッシュ)。実 WebCodecs encode は次PR |
| G7 | グレーディング GPU 適用が未実装コメント | `color/grading-engine.ts:468` | 🟡 | CPU 経路に LUT trilinear + tone-curve (Fritsch-Carlson) 実装済。WGSL compute shader は次PR |
| G8 | 顔検出が mock を返す | `ai/ai-effects-engine.ts:314` | 🟡 | 実検出は肌色ヒューリスティック実装済 (ML は G4 と同時) |
| G9 | 自動リフレーム (アスペクト比リターゲット) 欠落 | (新規) | ✅ | **実装済** `timeline/auto-reframe.ts` (被写体追従クロップ) |
| G10 | EDL/FCPXML が export のみ・import 不在 (往復不可) | `interchange/legacy-formats.ts` | ✅ | **実装済** EDL + FCPXML importer (往復OK) |

**本PRのスコープ**: G6 部分 — プロキシ生成の固定 10MB ダミーサイズ・乱数ハッシュを、
解像度×品質×コーデック×尺のビットレートモデルによる決定論的サイズ推定 (`estimateProxySize`)
+ 決定論的識別ハッシュ (FNV-1a) に置換。純ロジックで完全にユニットテスト可能。

## 3. 長所・短所・改善点 (2026-06-21 監査)

### 3.1 長所 (Strengths)
- **Web標準完結**: WebCodecs/WebGPU/WebAssembly/IndexedDB/Yjs のみ。プロプライエタリ API ゼロ → 10年生存性が高い。
- **テスト密度**: 118 テストファイル / 4196 ケース。リスクゾーン (recovery/audio/plugins) は回帰テスト付き。
- **入力境界の堅牢性**: 本セッションで NaN poisoning (PQ/HLG・loudness)・divide-by-zero (export fps・proxy quota)・
  XSS (plugin manifest/UI)・リスナーリーク (plugin-bridge) を実地検証の上で修正済み。
- **設計規律**: Command Pattern (undo)・依存逆転 (engine-context)・単一真実のデザインシステム。
- **互換層**: OTIO/EDL/FCPXML の往復変換 → 既存ワークフローへの組み込みが可能。

### 3.2 短所 (Weaknesses)
- **AI 推論バックエンド未接続 (G4)**: `loadModel` が擬似ロード。Transformers.js/ONNX Runtime Web 未配線 →
  ASR・アップスケール・セグメンテーションが実際には動かない (最大の機能ギャップ)。
- **GPU グレーディング経路 (G7)**: CPU 経路のみ。WGSL compute shader 未実装で 4K リアルタイムに届かない可能性。
- **プロキシ実 encode (G6)**: サイズ推定は実装したが、実ビットストリーム生成は未接続。
- **重複/オーファン**: `media/proxy-manager.ts` は production 未配線 (`proxy-workflow.ts` が正本)。
  テスト保持のため残置中だが、将来は統合候補。
- **顔検出の精度 (G8)**: 肌色ヒューリスティックのみ。誤検出率が高く、ML 実装が必要。

### 3.3 改善点 (Improvement Backlog, 優先度順)
1. **[P0] G4 AI バックエンド配線**: Transformers.js (WASM/WebGPU) を `loadModel` に接続。最大の価値。
2. **[P1] G7 WGSL グレーディング**: LUT 3D テクスチャ + tone-curve を compute shader 化。
3. **[P1] G6 実プロキシ encode**: WebCodecs `VideoEncoder` で実ビットストリーム生成 → 推定サイズを実測で置換。
4. **[P2] proxy-manager / proxy-workflow 統合**: 重複解消 (CLAUDE.md「重複ファイルは統合・削除」)。
5. **[P2] G8 顔検出 ML 化**: G4 完了後に BlazeFace 等を配線。

## 4. 受け入れ基準 (本PR — G6 サイズ推定)
- `estimateProxySize`: `size = w×h×fps×bpp×codecMult×dur/8` を満たし、非正入力で 0。
  品質順 (low<medium<high)・コーデック順 (vp9<h264<prores_proxy)・尺/画素数に線形。
- 生成プロキシの `size` は旧固定 10MB と一致しない (実推定値)。`hash` は同一素材+設定で決定論的 (旧乱数 UUID を排除)。
- 全ゲート (tsc 0 / 全テスト pass) を維持。既存 36 テスト + 新規 10 テスト = 46 pass。
