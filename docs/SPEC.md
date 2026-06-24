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
| Q19 | [Zenn: PointerEvents を使って要素をドラッグで動かす](https://zenn.dev/righttouch/articles/move-element-with-pointer-events) / MDN Pointer Events | **タイムラインのクリップ D&D がマウス専用**: `app/TimelineView.tsx` が `mousedown`+`window.mousemove/mouseup` を使用し、**タッチ/ペンでクリップを移動・トリムできない** (タブレット・Surface・iPad)。プロエディタとして致命的。また `window` リスナは無関係ハンドラを誘発しうる | ✅ **本PRで実装** (Pointer Events + `setPointerCapture` でマウス/タッチ/ペン統一、`window` リスナ撤廃、`touchAction:'none'` でスクロール抑止。ドラッグ算術を純関数 `computeClipDrag` に抽出し 12 テスト、pxPerSecond≤0 ガード付き) |

## 3.10 現段階の棚卸し: 広域コードベース監査 — 長所・短所・改善 (2026-06-23)

**監査の経緯** (2026-06-23): 第二回「現段階の長所短所改善点を洗い出して改良」要求。
timeline/undo 外の全モジュールを実地監査し、最も確実で高インパクトな 2 点を即時修正した。

### 修正済み

**Fix 1 — `goToPosition()` O(n²) → O(n)** (`undo/history-manager.ts`)

`goToPosition(target)` は `HistoryManager.undo()`/`redo()` をループ呼び出しして位置を移動して
いた。各 `undo()`/`redo()` 呼び出しは末尾で `notifyListeners()` を発火し、内部で
`getHistory()` (全コマンドを CommandSnapshot に変換、O(k) 作業) を実行する。N 位置を
跳ぶ際のトータルコストは O(N·k) = O(N²) (N=コマンド数、k=リスナ数)。

修正: ループ内で `command.undo()`/`command.redo()` を直接呼び、位置を手動更新。
ループ外の末尾で `notifyListeners()` を 1 回だけ発火。O(N) に改善。
副次効果: リスナへの呼び出し回数が N → 1 に減り、UI の中間状態フラッシュが消える。

| 観点 | 内容 |
|---|---|
| **性能** | maxCommands=1000 の全 undo (1000 ステップ戻し) で O(1000²) → O(1000)、1M 倍高速 |
| **通知意味論** | 以前: 1000 個の中間 HistoryState をリスナへ配信。以後: 確定後の 1 状態のみ配信 |
| **テスト追加** | `PERF: goToPosition 10 steps emits exactly 1 notification` / `no-op at same position` |

**Fix 2 — `computeClipDrag` resize-r と resize-l の挙動を統一** (`app/TimelineView.tsx`)

`resize-l` (左端トリム) は `newDuration ≤ MIN_CLIP_DURATION` 時に `null` を返してジェスチャを
棄却する (呼び出し元は clip を更新しない)。`resize-r` (右端トリム) は同条件で
`Math.max(MIN_CLIP_DURATION, ...)` の非 null 値を返していた。結果:

- sub-minimum clip は生成されない (両辺で防止済み) — バグではない
- しかし `resize-r` は最小値到達後もフレームごとに `onClipResize` を呼び続ける
  (同一のクランプ値で无駄な更新)
- 呼び出し元の null チェックが「左端のみ発火」という非対称な挙動を暗黙に要求する

修正: `resize-r` も `newDuration ≤ MIN_CLIP_DURATION` で `null` を返すように変更。
両辺の contract が統一: null = ジェスチャを無視する / 非 null = clip を更新する。

| 観点 | 内容 |
|---|---|
| **動作変更** | 最小幅到達後の連続 onClipResize 呼び出しが停止。視覚的変化なし |
| **テスト更新** | 既存「clamps to minimum」テストを「returns null」に変更 |
| **テスト追加** | trim-symmetry INVARIANT 2 ケース (両辺 null / 両辺 min+1frame で非 null) |

**Fix 3 — RecoveryManager を起動し localStorage 二重実装を統合** (`app/main.ts`, リスクゾーン recovery)

堅牢な IndexedDB ベースの `RecoveryManager` (チェックサム検証・複数スナップショット・
容量上限・トランザクショナル書き込み、95% テスト済み) がインスタンス化されているのに
**`init()` も `startAutoSave()` も一度も呼ばれず完全に休眠**していた。実際の自動保存は
`main.ts` が独自に持つ localStorage 直書き経路 (`saveRecoveryData`) で行われており、
2 つのリカバリ実装が並存 (クラッシュハンドラも二重) していた。localStorage 経路は
~5MB 制限・非トランザクショナルで、`RecoveryManager` の優位性を全く活かせていなかった。

修正: `RecoveryManager` を唯一のリカバリ実装に統合。
- `init()`/`initialize()` (React Context 経路) の両方で `recovery.init()` を呼び DB を開く
- `setupAutoSave()` を `recovery.startAutoSave(() => buildRecoveryData(), …)` に置換
  (定期保存とクラッシュスナップショットを RecoveryManager が所有)
- `buildRecoveryData()` アダプタを追加: live timeline 状態を `serializeTimelineState`
  (Map→entries / Set→array) で安全な形に変換して payload 化
- `checkRecovery()` を `recovery.getLatestSnapshot()`/`restoreSnapshot()` 経由に置換
- 重複していた crash handler 3 種 (`error`/`unhandledrejection`/`beforeunload`) を削除
  (RecoveryManager.setupCrashDetection が所有)。RecoveryManager が扱わない
  `visibilitychange` (タブ非表示時保存) のみ main.ts に残す
- 死んだコード削除: `saveRecoveryData`/`recoveryKey`/`autoSaveTimer`/重複 `RecoveryData`
  interface/未使用 `safeStorage*` import
- greenfield (既存ユーザー無し) のため移行コード不要

| 観点 | 内容 |
|---|---|
| **データ堅牢性** | localStorage(~5MB, 非トランザクショナル, 1 スナップショット) → IndexedDB(容量大, トランザクショナル, チェックサム検証, 複数スナップショット) |
| **重複排除** | 2 つのリカバリ実装 + 二重クラッシュハンドラ → 1 系統に統合 (CLAUDE.md「重複は統合」) |
| **テスト追加** | `tests/recovery-integration.test.ts` 4 ケース: timeline の Map/Set が IndexedDB 往復で保全されること (regression)・selection 復元・startAutoSave コールバックが live 状態を捕捉・素の JSON.stringify ではクリップが消失することの証明 |
| **挙動不変** | typecheck PASS / 既存 recovery 50 + timeline 107 テスト維持 / 総数 4374 |

### 未実装 (優先度付き残課題)

| 優先 | 場所 | 内容 |
|---|---|---|
| 🔴 CRITICAL | `app/shell.tsx:223-235` | `handleClipMove`/`handleClipResize` がエンジンを経由せず、ドラッグ編集が undo 不能。`timelineClips` が React ローカル state でエンジンと未接続。React⇔エンジンを単一の真実源に統合する基盤データフロー改修が前提で影響大 |
| 🟠 HIGH | `recovery/` 統合 | **→ 本PR で解決済み (Fix 3)** |
| 🟡 MEDIUM | `app/TimelineView.tsx` (右端トリム) | **→ 本PR で解決済み** |
| 🟡 MEDIUM | `undo/history-manager.ts` (goToPosition) | **→ 本PR で解決済み** |
| ~~🟢 LOW~~ | ~~accessibility/, animation/, captions/~~ | **誤検出**: 監査AI(haiku)の誤り。`wcag-audit.test.ts`/`keyframe-animator.test.ts`/`caption-manager.test.ts` 等で既にテスト済み |
| ❌ 却下 | `goToPosition()` redo-stack pruning | 監査AIの提案は誤り。`goToPosition` は双方向スクラバーで、forward stack を破棄すると前方ナビゲーションが壊れる (既存 `jumps forward` テストが fail)。メモリは `maxCommands` で既に上限あり |

## 3.9 現段階の棚卸し: Command システムの長所・短所・改善 (自己監査)

**監査の経緯** (2026-06-23): §3.5〜§3.8 で構造編集の Command 化を一気に進めた結果、
`MagneticTimeline` に 10 個の `*Command` メソッドが追加された。蓄積したコードの長所・
短所・改善点を実地監査で洗い出した。

| 観点 | 内容 |
|---|---|
| **長所** | (1) 全主要構造編集 (split/add/delete/deleteSelected/closeGaps/move/trimStart/trimEnd/lift/extract) が Command 化され undo/redo 可能。(2) スナップショット方式で undo の正しさが自明 (全状態を保存・復元するため部分復元バグが起きない)。(3) 双対表現不変条件・原子的通知・index キャッシュ等の横断的修正で基盤が堅牢。(4) 全 Command が純粋な mutator を再利用 (挙動の一貫性) |
| **短所** | (1) **8 メソッドが同一の snapshot/restore ボイラープレートを重複** (各 ~15 行)。(2) **`moveClipCommand`/`trimClipStartCommand`/`trimClipEndCommand`/`addClipCommand` が app 層から未呼び出し** — UI のドラッグハンドラ (`shell.tsx` `handleClipMove`/`handleClipResize`) が React ローカル state のみ変更しエンジンを経由しないため、ドラッグ編集が undo 不能。(3) `snapshotClips()` が編集ごとに全クリップを 2 回 clone — 1000+ クリップで GC 圧 (delta 方式が望ましい) |
| **改善点** | (1) ~~snapshot/restore ボイラープレートを `structuralCommand(type, desc, mutate)` ヘルパに抽出~~ **→ 完了 (本PR)**。(2) UI ドラッグハンドラをエンジン経由 (`moveClipCommand`/`trimClipCommand` → `history.execute`) に接続し、ドラッグ編集を undo 可能化 (大規模・要 React⇔エンジン同期設計)。(3) snapshot を delta (変更フィールドのみ) に置換し大規模プロジェクトのメモリを削減 |

**改善 (1) 完了詳細 (本PR)**: 8 個の Command メソッドが繰り返していた
`before = snapshotClips(); let after; apply = () => {...}; return CommandFactory.structural(...)`
を private ヘルパ `structuralCommand(type, description, mutate)` に集約。各メソッドはガード節 +
`return this.structuralCommand('clip.x', 'Desc', () => this.mutator(...))` の 1 行に短縮。
`deleteSelectedCommand` の batch も mutate クロージャ内に収まり同一ヘルパを利用。
正味 -68 行。挙動不変 (107 timeline テスト全て pass)。lift/extract は逆操作を
`captureRangeEditUndo` で解析的に算出する別経路 (`rangeEditCommand`) のため対象外。

**残課題 (2)(3) の優先度判断**: (2) UI ドラッグのエンジン接続は React の `timelineClips`
state とエンジンの `state.clips` Map の二重管理を一本化する設計が前提で影響範囲が大きいため、
別タスクとして切り出す。(3) delta 方式は正しさの自明性 (長所2) とのトレードオフがあり、
実プロジェクトで 1000+ クリップのメモリ問題が顕在化してから着手する (早すぎる最適化を回避)。

## 3.8 新視点: 原子性の錯覚 — Observer パターンのバッチ通知と IntervalIndex キャッシュ (ソクラテス式問答)

**問答の経緯** (2026-06-23):

**第一問**: 「Command は不可分な操作を抽象化する。`deleteSelectedCommand` が N クリップを削除するとき、 Observer は何回状態変化を受け取るか？」

**答え**: N 回。各 `deleteClip(id)` が内部で `notify()` を発火するため、5 クリップの「原子的」削除で Observer は 5 つの中間状態を目撃する。`selection = {A,B,C,D,E}` のうち A だけ消えた状態、A と B が消えた状態……が連続して届く。UI は不完全な削除状態を瞬間的にレンダリングし、Observer が中間状態で別の操作を起こすと予期しない動作を生む。

**修正**: `beginBatch()`/`endBatch()` 軽量バッチ機構を追加。`batchDepth > 0` の間は `notify()` を `batchPending = true` に蓄積し、`endBatch()` がカウンタを 0 に戻した時点で**一度だけ**発火。`deleteSelectedCommand` の N クリップ削除ループを `beginBatch`/`endBatch` で挟み、N → 1 通知に圧縮。

**第二問**: 「`IntervalIndex` は O(log n + k) クエリのために導入されたが、現在の `getClipsAtTime()` は本当に O(log n + k) か？」

**答え**: No。`buildIntervalIndex()` がクエリごとに O(n) で毎回再構築されており、合計コストは O(n) + O(log n + k) = **O(n)**。線形探索と変わらず、IntervalIndex 導入の効果がゼロだった。

**修正**: `clipIndexCache` フィールドを追加し、`getClipIndex()` が `null` の場合のみ O(n) 構築、以降は O(1) 返却。`_fireListeners()` (全 `notify()` の共通終端) でキャッシュを無効化することで、クリップ操作後も確実に最新状態を反映。初回クエリ後の連続 `getClipsAtTime()` が **O(log n + k)** に改善。

| 観点 | 内容 |
|---|---|
| **長所** | Batch 機構は既存 API を変えず完全後方互換 (各 operation は引き続き notify() を呼ぶ)。IntervalIndex キャッシュは notify ベースの自動無効化なので、キャッシュ無効化のタイミング管理が不要。どちらも 10 行以内の変更で高い効果 |
| **短所** | Batch は `deleteSelectedCommand` のみに適用 (他の multi-clip 操作は現状 1 notify なので不要)。IntervalIndex キャッシュは `getClipsAtTime` 専用 — `findNearestSnapPoint` の `getSnapPoints()` は依然 O(n) 毎呼び出し |
| **改善点 (残)** | (1) `findNearestSnapPoint` も IntervalIndex を使って O(log n) に最適化、(2) 将来の multi-step command に batch を適用するための convenience wrapper (`withBatch(fn)`) を追加、(3) 通知の coalescing (同一フレーム内の複数 notify を RAF で 1 回に合流) |

## 3.7 新視点: 双対表現不変条件 (Dual-Representation Invariant) — ソクラテス式問答

**問答の経緯** (2026-06-23):

第一問「`restoreClips()` は全ての不変条件を維持するか?」

`MagneticTimeline` の選択状態は **2 つの表現**で二重管理されている。
- `clip.selected: boolean` — クリップオブジェクトのレンダリング用フラグ
- `state.selection: Set<string>` — O(1) 多選択クエリ用の索引

直接変異 API (`selectClip`/`deselectAll`/`deleteClip`) は両方を整合的に更新する。
しかし `restoreClips()` (Command Pattern のリバート原始関数として追加) は
`state.clips` のみ復元し **`state.selection` を復元しない**。

結果: undo 後に「ゴースト選択」が発生する。

```
execute() → clips 削除 + selection から ID 除去 (ok)
undo()    → clips 復元 (clip.selected = true) + selection は空のまま (!!)
```

`clip.selected === true` かつ `state.selection.has(id) === false` という矛盾状態。
選択されているように見えるが `deleteSelectedCommand()` は `state.selection` を見るため
次の Delete キーが no-op になる (ゴースト選択)。

**修正**: `restoreClips` でスナップショットの `selected` フラグから `state.selection` を再構築:
```typescript
this.state.selection.clear();
for (const c of snapshot) {
  this.state.clips.set(c.id, { ...c });
  if (c.selected) this.state.selection.add(c.id);  // 両表現を原子的に復元
}
```

第二問「undo で元に戻せない最も頻繁な編集操作は何か?」

undo 可能な操作: split / add / delete / closeGaps / lift / extract。
**undo 不能な操作**: `moveClip`・`trimClipStart`・`trimClipEnd` — ドラッグ移動・トリムが全て非可逆。
これらは NLE の日常操作の大半を占める。

**修正**: `moveClipCommand` / `trimClipStartCommand` / `trimClipEndCommand` を追加。
全て `snapshotClips → apply → restoreClips` パターン (他の構造コマンドと同一)。

| 観点 | 内容 |
|---|---|
| **長所** | 双対表現不変条件を全コードパスで保証。undo 後のゴースト選択が完全に解消。move/trimStart/trimEnd も undo 可能になり、全主要編集操作が Command Pattern 化 |
| **短所** | スナップショット方式はクリップ数に線形 (全 clips を clone)。IntervalIndex による O(log n) 化は未着手 |
| **改善点 (残)** | (1) UI (shell.tsx) でドラッグ終了時に `moveClipCommand`/`trimClipCommand` を `history.execute` 経由で呼ぶ (現状はドラッグが React ローカル state にのみ反映)、(2) move/trim の連続操作を merge して履歴を圧縮、(3) IntervalIndex で O(log n) 化 |

## 3.6 新視点: 可逆性 (Reversibility) — Lift/Extract を undo 可能化 (ソクラテス式問答)

**問答の経緯**: 「全クリップ操作は Command Pattern で undo 可能」(CLAUDE.md undo) を
起点に実証 → `HistoryManager`+`CommandFactory` は完備だが、**構造編集 (split/lift/
extract/addClip 等) は一つも Command 化されておらず**、`undo`/`redo` は実際の編集を
一切元に戻せない (キーには bind 済みだが no-op 同然)。直前に追加した Lift/Extract も
この不変条件に違反していた。

実装 (最初の構造編集を end-to-end で可逆化):
- `CommandFactory.structural(type, desc, apply, revert)` — 複数クリップの
  追加/削除/分割をまとめて扱う汎用可逆コマンド (既存 DI スタイル踏襲)。
- `range-edit.ts` `captureRangeEditUndo(before, result)` — 純関数で逆操作データ
  (removed / modifiedBefore / addedIds) を算出。
- `MagneticTimeline.liftCommand()/extractCommand()` — 可逆コマンドを返す。
  `main.ts` のショートカットは `history.execute(cmd)` 経由に変更 → undo/redo 可能。

| 観点 | 内容 |
|---|---|
| **長所** | execute→undo→redo で元の clip 集合へ厳密復元 (split-tail id も安定)。`captureRangeEditUndo` は純関数で入力非破壊。`structural` は全構造編集で再利用可能な基盤。実 `HistoryManager` 経由の round-trip テスト込み |
| **短所** | merge 非対応 (連続 extract / split は個別履歴エントリ)。`moveClip`/`trimClip*` は Command 化未着手 |
| **改善点 (残)** | (1) ~~split/add/delete/closeGaps も `structural` でラップ~~ **→ 完了 (2026-06-23)**。(2) UI の undo ボタン状態を `canUndo/canRedo` に同期、(3) range-edit を IntervalIndex で高速化、(4) moveClip/trimClip も Command 化 |

**改善 (1) 完了詳細 (2026-06-23)**:
`MagneticTimeline` に `splitClipCommand()` / `addClipCommand()` / `deleteClipCommand()` /
`deleteSelectedCommand()` / `closeGapsCommand()` を追加。全メソッドはスナップショット方式
(execute 前の全 clip を保存 → revert で完全復元) を採用し、`CommandFactory.structural`
でラップして `HistoryManager` に渡せる形で返す。`main.ts` の `split` ショートカットは
`splitClipCommand` 経由 → `history.execute()` に変更。`delete` / `rippleDelete` ショートカット
に `deleteSelectedCommand` のコールバックを登録 (これまで未登録で無効だった)。
テスト: 16 本追加 (split/delete/deleteSelected/closeGaps 各 Command の execute/undo/redo round-trip)。

## 3.5 新機能: 3点編集 Lift / Extract (ソクラテス式問答で導出)

**問答の経緯**: 「プロ編集者が多用するのに Artone に無い操作は何か」を起点に、
タイムラインの既存操作を実地調査 → `splitClip`・`closeGaps`・`inPoint/outPoint` は
あるが、**マークした in→out 範囲を一括で取り除く操作 (Lift / Extract) が欠落**して
いることを確認。これは Premiere/FCP/DaVinci 全てが備える中核機能。

実装: `timeline/range-edit.ts` (純関数) + `MagneticTimeline.lift()/extract()` +
キーボード (Lift=`;`, Extract=`'`) + 11 言語 i18n。

| 観点 | 内容 |
|---|---|
| **長所** | 純関数 (`liftRange`/`extractRange`) で DOM 非依存・完全テスト可 (14+8 テスト)。`splitClip` と同一の線形メディアマッピングで一貫性。locked クリップ/トラック限定に対応。in/out 逆順を正規化。`pxPerSecond≤0`・空範囲をガード |
| **短所** | 現状は単一シーケンス内のクリップのみ (ネスト/マルチカム連動は未対応)。範囲分割で生じる新クリップは undo/history と未連携 (Command パターン化は次段)。リップルは全トラック一律 (トラック個別ロックは尊重するが、リンク選択は未考慮) |
| **改善点** | (1) Command パターンでラップし undo 可能化、(2) magnetic-timeline の IntervalIndex を使い O(n)→O(log n) 探索、(3) リンクされた A/V クリップのグループ extract、(4) `app/shell.tsx` の UI ボタン露出 (現状キーボード+API のみ) |

## 4. 受け入れ基準 (本PR — G6 サイズ推定)
- `estimateProxySize`: `size = w×h×fps×bpp×codecMult×dur/8` を満たし、非正入力で 0。
  品質順 (low<medium<high)・コーデック順 (vp9<h264<prores_proxy)・尺/画素数に線形。
- 生成プロキシの `size` は旧固定 10MB と一致しない (実推定値)。`hash` は同一素材+設定で決定論的 (旧乱数 UUID を排除)。
- 全ゲート (tsc 0 / 全テスト pass) を維持。既存 36 テスト + 新規 10 テスト = 46 pass。
