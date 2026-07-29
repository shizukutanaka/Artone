# Artone v3 — First Principles による過不足監査

作成: 2026-07 / 対象: `main` (v3.1.0 系) / 全主張は実コードで検証済み (file:line 付き)

姉妹文書:
[`product-assessment-2026-07.md`](./product-assessment-2026-07.md) が**コード品質**の観点で
評価するのに対し、本書は **First Principles** — 「ユーザー価値を生むループにどれだけ寄与するか」
だけを尺度に再評価する。品質が高くても**ユーザーに届いていなければ価値はゼロ**という立場を取る。

---

## 0. 第一原理

ビデオエディタが存在する理由はただ一つのループである:

> **① 実メディアを取り込む → ② 見る → ③ 編集する → ④ プレビューする → ⑤ 実ファイルを書き出す**

このループを閉じないものは、どれだけ精巧でも副次的である。以下、この尺度だけで判定する。

## 1. コアループの実動状況

| 段階 | 状態 | 根拠 |
|------|------|------|
| ① 取り込む | **動く** (メタデータ + サムネイル生成まで) | `media/media-browser.ts` の `importFile()` は実際に `<video>` を使い `extractVideoMetadata` / `generateVideoThumbnail` を実行 |
| ② 見る | **未接続** | プレビュー面に `<video>`/`<canvas>` が存在しない (`app/*.tsx` の `data-testid` 含め該当ゼロ)。※サムネイル欠落は本監査で修正済み (下記 §4) |
| ③ 編集する | **半分** | UI のタイムラインは `app/shell.tsx` のローカル React state。エンジンの `MagneticTimeline` とは別物で、両者を繋ぐ経路が無い |
| ④ プレビューする | **未接続** | `app/main.ts:409-412` `getCurrentVideoFrame()` は `return null; // Implemented in actual video pipeline` のスタブ。`this.render.render(` の呼び出し回数 = **0** |
| ⑤ 書き出す | **明示的に throw** | `app/main.ts:681` — "Export is not yet wired to the render pipeline" |

### 根本原因は1つ

**デマルチプレクサが存在しない。** `core/webcodecs-pipeline.ts` の `decodeFrame()` は
`EncodedVideoChunk[]` を要求するが、**`File` から `EncodedVideoChunk` を作れるコードが
リポジトリ内に存在しない** (mp4box.js も FFmpeg WASM も不在。`core/codec-router.ts` は
FFmpeg 経路を「判定」するだけで実体が無い)。

したがって ②④⑤ が同時に止まっている。**逆に言えば「タイムライン時刻 t のフレームを返す
関数」1つで3段階が同時に開通する。** `export/export-engine.ts` の `export()` は
`renderFrame: (i) => Promise<VideoFrame>` コールバックを受け取る設計で、実 ISOBMFF/WebM
ライタまで完成している — **product 全体で欠けているのは、ファイルからフレームを取り出す
その1関数だけ**である。

## 2. 過剰 — 作られているが繋がっていない

`app/` からの import を実測した結果 (0 = UI から到達不能):

| モジュール | app/ からの import |
|-----------|-------------------|
| `plugins/plugin-bridge.ts` (VST3/AU ブリッジ) | **0** |
| `color/hdr-engine.ts` (他 color/ の大半) | **0** |
| `audio/surround-audio.ts` (他 audio/ の大半) | **0** |
| `animation/motion-path.ts` | **0** |
| `core/timecode.ts` (SMPTE 演算) | **0** |
| `export/export-queue.ts` | **0** |

さらに `app/main.ts` のコンストラクタが生成する **11 個のエンジンは、生成行以外に参照が
1つも無い** (`this.<name>` の出現回数がいずれも 1):

`textEditor` / `multiCam` / `colorGrading` / `video` / `ai` / `plugins` / `collab` /
`proxy` / `keyframes` / `motionGfx` / `captions`

つまり **new されただけで一度も呼ばれない**。`colorGrading` が該当することは、Color パネルが
プレースホルダ表示であることと整合する。

i18n も同様の乖離がある: `i18n/locales.ts` は **78 ロケールを宣言**するが、実翻訳ファイルは
**11 個**しかない。

## 3. 重複 — 同一概念の多重実装

本セッションで**同一機構の浮動小数点切り捨てバグを4ファイルで4回修正した** (caption-manager
→ text-based-editing → marker-manager → TimelineView)。これは個別バグではなく
**「時刻整形という同一概念が N 箇所に重複実装されている」構造的欠陥の症状**である。

同様の重複:
- **クリップ型が8種類** (`app/TimelineView.tsx` / `timeline/magnetic-timeline.ts` /
  `nested-sequences.ts` / `trim-operations.ts` / `edit-snapping.ts` / `project/` /
  `interchange/otio.ts` / `undo/history-manager.ts`)。**③ の断絶を生んでいる直接原因**で、
  最も高くついている重複。
- **`MediaItem` 型が2種類** (UI 用と engine 用) — §4 で修正した不具合の温床。
- **SRT/VTT シリアライザが3実装**、**`clamp` が約15実装**、**easing 定義が3種**。

## 4. 本監査で実行した改善

**engine が生成したサムネイルが UI に届いていなかった不具合を修正** (コアループ ② の一部):

`media/media-browser.ts` は取り込み時に実フレームからサムネイル (data URL) を生成し解像度と
実測尺も取得していたが、`app/shell.tsx` は `File` から独自に UI アイテムを組み立てており
**その成果物を一切受け取っていなかった**。結果 `thumbnailUrl` は常に `undefined` となり、
`app/MediaBrowser.tsx` の表示は必ず絵文字 (🎬) にフォールバック — **engine が正しく作った
フレームが捨てられ、ユーザーは取り込んだ映像を一度も見られなかった**。

純関数 `mergeEngineMetadata()` / `findEngineMetadata()` を追加して engine 側メタデータを
反映するよう配線し、回帰テスト8件を追加した (engine が実測尺を持つ場合は `<video>` の
二重生成による再プローブも省略)。

## 5. 判断 — 次に何をすべきか

### ユーザー価値を最も上げる上位3件

1. **「時刻 t のフレームを返す関数」を作る** — 本リポジトリで**桁違いに最高レバレッジ**。
   ②④⑤ が同時に開通し、完成済みの `ExportEngine` がそのまま動き出す。
   段階案: (a) `mp4box.js` を導入して既存 `VideoPipeline` に供給する本命路線、または
   (b) 依存ゼロで今日動く暫定策として隠し `<video>` + `requestVideoFrameCallback` +
   `drawImage`。
2. **プレビュー面に実際の `<video>`/`<canvas>` を置く** — (1) の前でも、選択メディアの
   blob URL を流すだけでユーザーは初めて自分の映像を見られる。
3. **タイムラインモデルを1つに統合する** — `shell.tsx` のローカル state を捨て、
   `MagneticTimeline` を単一の真実とする。これだけで多数のショートカット・実 undo/redo・
   スナップ/リップルが一斉に有効化される。**現状クラッシュ復旧が空のタイムラインを
   復元する状態も同時に解消される** (潜在的なデータ損失)。

### 寄与に対して作りすぎている上位3件

1. **`color/`** — ACES IDT/ODT・HDR PQ/HLG・ΔE2000・3D LUT 等が揃うが、Color パネルは
   プレースホルダで `ColorGradingEngine` は一度も呼ばれない。**色を表示できない製品の中の
   色科学ライブラリ**。
2. **`audio/` の `audio-engine.ts` 以外** — HPSS 音源分離・スペクトルゲート・5.1/7.1
   サラウンドまで実装済み。一方 `AudioEngine` に `play()` は無く、**アプリは音を出せない**。
   再生より先にサラウンドを作るのは優先順位の逆転。
3. **`plugins/` (VST ブリッジ) と `interchange/` (OTIO/EDL/FCPXML)** — いずれも10年
   エコシステム互換への賭けだが、**まだ MP4 を1本も書き出せない製品**の相互運用機能である。
   `collab/`・`ai/` も同じ区分 (エンジンは生成されるが未使用)。

### 総括

個々のモジュールの**実装品質は高い**。しかし製品としては
**「シェルの背後に巨大な未配線ライブラリが積まれている」**状態にある。
4,700 のテストが緑であることと、ユーザーがループを一周できることは別問題である。
**§5 の (1) を実装すれば、既に書かれているコードの約半分が一斉に「本物」になる。**
