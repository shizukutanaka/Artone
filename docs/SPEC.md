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

### 3.4 Qiita / Zenn リサーチからの追加改善 (2026-06-21)
コミュニティ知見を Artone コードに照合した結果、以下の実装可能な改善を特定:

| # | 出典 | 改善内容 | 状況 |
|---|---|---|---|
| Q1 | [Qiita: WebTransport+WebCodecs ビデオエコー](https://qiita.com/alivelime/items/34cababe3105c2af8068) / [Chrome 公式 WebCodecs ベストプラクティス](https://developer.chrome.com/docs/web-platform/best-practices/webcodecs) | **`encodeQueueSize` バックプレッシャ未実装**: VideoEncoder/AudioEncoder のキューを監視せずに `encode()` を投入し続けると、長尺 4K エクスポートで GB 級メモリ膨張・クラッシュ。`'dequeue'` イベントで待つのが正規パターン | ✅ **本PRで実装** (`awaitEncoderQueueBelow`) |
| Q2 | [Qiita: AbortController / setTimeout 設計](https://qiita.com/CRUD5th/items/560e4b9b0e1e2fd85819) | **`proxy-manager.cancelJob` が走行中ループを中断できていない**: `setTimeout` ループ内で `job.status` 未チェック → cancel 後も 2秒間処理を続け、最後に `proxy.status='ready'` を付けて phantom proxy を残す | ✅ **本PRで実装** (ループ内 status チェック + 中断時 proxy 削除) |
| Q3 | [Zenn: WebGPU パフォーマンスチューニング](https://zenn.dev/emadurandal/books/cb6818fd3a1b2e/viewer/performance-tuning) | **Pipeline/BindGroup 作成オーバーヘッド**: 毎フレーム生成は致命的。キャッシュ必須。`render/webgpu-engine.ts` の現状を要監査 | 🟡 監査未完了 (render/ は WebGPU API モックでテスト不能) |
| Q4 | [Zenn: TypeScript `as const satisfies`](https://zenn.dev/tonkotsuboy_com/articles/typescript-as-const-satisfies) | **EXPORT_PRESETS 等の定数オブジェクトに `satisfies` 未適用**: widening で型安全性を一部失っている。`as ExportPreset[]` キャストは型チェック緩い | 🟡 次PR (低リスク・型安全性向上のみ) |
| Q5 | [Qiita: IndexedDB トランザクション特性](https://qiita.com/largetownsky/items/346e73d4e7bc707034e5) | **大量書き込みのトランザクション粒度**: recovery/project の bulk write は単一トランザクションが望ましい | ✅ enforceLimit は単一 tx 化済 (CHANGELOG 既出) |
| Q6 | [Zenn: ReadonlyArray<T> を使おう](https://zenn.dev/narumincho/articles/typescript-readonly-array) | **公開 API の `T[]` 返却**: 呼び出し側に破壊的操作の余地を残している箇所多数 | 🟡 次PR (低リスク・段階適用可能) |
| Q7 | [Zenn: WebCodecs QP エンコーディング](https://zenn.dev/tetter/articles/webcodecs-qp-encoding) | **per-frame QP 制御未対応**: ビットレート指定のみ。VBR/CRF 風の品質一定制御は未実装 | 🟡 次PR (`ExportConfig.qpMode?: 'cbr' | 'crf'`) |
| Q8 | [Zenn: storage.estimate / 容量見積もり](https://zenn.dev/peter_norio/articles/e0620bfd7feb8f) / [Zenn: 容量超過時の動作](https://zenn.dev/tosa/articles/0f1f82afd9a8aa) / MDN StorageManager.persist | **`navigator.storage.persist()` 未呼び出し (最重要)**: 10年ローカルファースト・データ主権を掲げるのに永続化を要求しておらず、ブラウザのデフォルト "best-effort" バケットはディスク逼迫時に IndexedDB (プロジェクト/リカバリ/プロキシ) を**無断退避**しうる。`recovery/` `project/` のデータ損失対策が土台から崩れる | ✅ **本PRで実装** (`app/storage-persistence.ts` + `main.init` で起動時要求) |
| Q9 | [Qiita: Yjs アップデート送信を間引いて DB 負荷軽減](https://qiita.com/kanta_matsu/items/e967e6c0e1c487a853be) | **カーソル awareness ブロードキャストの非間引き**: `collaboration-engine.updateCursor` が mousemove ごと (60-120回/秒) に `JSON.stringify`+全ピア送信し、DataChannel を溢れさせる。最新値のみ重要な awareness は trailing-edge throttle で合体すべき | ✅ **本PRで実装** (50ms throttle + 最新値合体 + disconnect 時 flush) |
| Q10 | [Qiita: canvas パフォーマンス向上](https://qiita.com/mczkzk/items/69ce0c0e4edc7a7caa64) / MDN getContext willReadFrequently | **`getImageData` 多用コンテキストに `willReadFrequently` 未指定**: コードベース全体で 0 箇所。`drawImage→getImageData` する読み取りコンテキスト (scopes は毎フレーム) で、Chrome は canvas を GPU バックドのまま保持し各 `getImageData` で GPU→CPU 読み戻しが発生、60fps プレビューでフレームドロップの原因になる | ✅ **本PRで実装** (scopes 4 + color/grading + color/lut + ai-effects 3 + core/pipeline + export + nested-sequences の読み取りコンテキストに `willReadFrequently:true`。描画専用コンテキストは除外) |
| Q11 | [Boundev: structuredClone vs JSON.stringify](https://www.boundev.com/blog/javascript-deep-cloning-structured-clone-2026) / Qiita Web Worker 構造化複製 | **`JSON.stringify(Map/Set)` = `{}` によるリカバリのデータ全損 (最重要)**: `app/main.ts` の `saveRecoveryData` が `JSON.stringify(timeline.getState())` をそのまま保存。`TimelineState` の `tracks`/`clips` は `Map`、`selection` は `Set` で、JSON 化すると全て `{}` に潰れ、**クラッシュリカバリのスナップショットから全トラック・全クリップ・選択が無言で消える**。`project/project-manager.ts` の JSON clone は対象が純 JSON のため可 (確認済・問題なし) | ✅ **本PRで実装** (`serializeTimelineState`/`deserializeTimelineState` で Map→entries・Set→array 変換、リカバリ経路に配線) |
| Q12 | [Zenn: AudioWorklet シンセサイザー (クリックノイズ対策)](https://zenn.dev/rerrah/articles/5b649722ffc3c2) | **`AudioParam.value` 直接代入によるクリック/ポップノイズ**: `audio/surround-audio.ts` の `setChannelGain`/`setChannelMute`/`soloChannel`/`unsoloAll` の 4 hot path が `node.gain.value = …` で即値代入。サンプルストリームに不連続なステップが入り、ミュート/ソロ操作のたびに**スピーカーから「プチッ」というクリック音**が出る。プロ用途のサラウンド (5.1/7.1/Atmos) では特に致命的 | ✅ **本PRで実装** (`smoothGain` ヘルパ: `cancelScheduledValues` → `setValueAtTime(現在値)` → `linearRampToValueAtTime(target, +10ms)` の標準パターン) |
| Q13 | [Qiita: 想像以上に遅かった toLocaleString](https://qiita.com/jkr_2255/items/d53200e6001b4d28e8f7) / [Qiita: Intl.NumberFormat](https://qiita.com/shisama/items/661c33fef5cbe3bb8335) | **`Intl.*` フォーマッタを毎回 `new` するコスト**: `i18n/i18n-manager.ts` が `t()` の補間ごとに `new Intl.NumberFormat`/`DateTimeFormat`/`PluralRules` を生成。Intl コンストラクタはロケールデータ解決を伴い最も高コストな platform 呼び出しの一つで、`t()` は毎レンダー・リスト項目ごとに走る。生成をキャッシュすべき | ✅ **本PRで実装** (ロケール別フォーマッタ Map キャッシュ `getNumberFormatter`/`getDateTimeFormatter`/`getPluralRules`) |
| Q14 | [Zenn: localeCompare で自然順ソート](https://zenn.dev/shzawa/articles/4844c1673d208f) / [Zenn: 数値を含む文字列を自然順ソート](https://zenn.dev/mato/articles/d67baf084998c4) | **メディア名ソートが辞書順で不自然**: `media/media-browser.ts` の name ソートが `localeCompare()` を `{ numeric: true }` なしで使い、"Take 2.mp4" が "Take 10.mp4" の**後ろ**に並ぶ。メディアは Take 1/2/…/10/100・shot_001 等の連番命名が常套で、ファイルブラウザとして致命的な並び | ✅ **本PRで実装** (`Intl.Collator({ numeric: true, sensitivity: 'base' })` を 1 度生成しキャッシュ、name ソートに適用) |
| Q15 | [Qiita: Three.js WebGL コンテキスト限界突破](https://qiita.com/timeless-residents/items/a6ba2102cf801051450e) / MDN WebGLContextEvent | **WebGL コンテキストロスト未処理 (本番クラッシュ)**: `render/webgl-fallback.ts` が `webglcontextlost`/`webglcontextrestored` を一切処理せず。GPU リセット・ドライバ更新・モバイルのタブ退避でコンテキストが失われるとレンダラが無言で死に復帰不能。特に `webglcontextlost` で `preventDefault()` を呼ばないとブラウザは `restored` を発火せず、復帰の道が絶たれる | ✅ **本PRで実装** (lost で `preventDefault`+リソース破棄+一時停止、restored で `setupGLResources` 再実行、`onContextChange`/`isContextLost` API、HTMLCanvas/OffscreenCanvas 両イベント名対応、destroy でリスナ解除) |
| Q16 | [MDN: GPUDevice.lost](https://developer.mozilla.org/en-US/docs/Web/API/GPUDevice/lost) / Q15 の対 (WebGPU 版) | **WebGPU デバイスロスト未処理**: `render/webgpu-engine.ts` が `device.lost` Promise を監視せず、GPU デバイス喪失でレンダラが無言で死亡。WebGPU は WebGL と異なり "restored" イベントが無く、再 `requestDevice` + 全リソース再構築が必要。また意図的な `device.destroy()` も `device.lost` を reason `'destroyed'` で解決するため、これをクラッシュと誤認しない区別が必須 | ✅ **本PRで実装** (`device.lost` 監視、`'destroyed'` 除外、lost で一時停止+通知、`attemptRecovery` で再 initialize 自動復帰、`onContextChange`/`isDeviceLost` API、destroy で intentional フラグ) |
| Q17 | Q15/Q16 統合 (`render-backend.ts`) | **コンテキスト喪失の統括欠如**: Q15/Q16 で各エンジンに `onContextChange` を追加したが、統括役の `render-backend.ts` が**誰も購読しておらず**、GPU 喪失時に `active` が stale なまま (renderLayers が喪失バックエンドへ描画継続)、UI も喪失を検知できなかった | ✅ **本PRで実装** (`bindContextLoss` で各エンジンの喪失を購読、喪失中 `active='none'` で renderLayers 一時停止、復帰で `resolvedBackend` へ復元、backend 自身の `onContextChange`/`isContextLost` API で UI へ転送) |
| Q18 | [Zenn: 実装しながら理解するモーダルのアクセシビリティ](https://zenn.dev/dqn/articles/36045bb89d5d69) / WCAG 2.1 AAA | **コマンドパレットのモーダル a11y 不備**: `app/command-palette.tsx` が `role="dialog"`/`aria-modal` 無し・**フォーカストラップ無し** (Tab で背後の UI へフォーカスが逃げる)・閉じても元の要素へフォーカスが戻らない。WCAG AAA (プロジェクト目標) のモーダル要件に違反。React Testing Library 未導入のため部品を純関数化してテスト | ✅ **本PRで実装** (再利用可能 `app/focus-trap.ts`: `getFocusableElements`/`trapTabKey`/`captureFocus` を jsdom で 13 テスト。パレットに `role="dialog"`+`aria-modal`+combobox ARIA、Tab トラップ、閉じる時フォーカス復元を配線) |

## 4. 受け入れ基準 (本PR — G6 サイズ推定)
- `estimateProxySize`: `size = w×h×fps×bpp×codecMult×dur/8` を満たし、非正入力で 0。
  品質順 (low<medium<high)・コーデック順 (vp9<h264<prores_proxy)・尺/画素数に線形。
- 生成プロキシの `size` は旧固定 10MB と一致しない (実推定値)。`hash` は同一素材+設定で決定論的 (旧乱数 UUID を排除)。
- 全ゲート (tsc 0 / 全テスト pass) を維持。既存 36 テスト + 新規 10 テスト = 46 pass。
