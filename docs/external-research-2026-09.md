# 外部知見に基づく改善の採否記録 (2026-09)

依頼「GitHub・論文・Qiita・Zenn・海外技術情報を参考にさらなる改善」への回答。
**読めたものと読めなかったものを区別し、実測できたものだけを根拠にする。**

## 読めなかったもの
- **Zenn** (`zenn.dev`): egress proxy に遮断された。検索結果の題名
  (「WebCodecs の QP 設定による高精度ビットレート制御」) 以上は読めていない。
  **記事の主張を根拠にした変更はしない。**

## 採否

### 1. Mediabunny 1.54.0 → 1.60.0 — **不採用 (差し戻し)**
- 動機: 1.56 で負のタイムスタンプ対応・任意区間のコピー変換 (トリム)、1.59 で音声
  リサンプリングのバッファ flush 修正 (公式リリースノート)。
- 実測: 型/単体 4,850 件・`npm audit` 0 件・実ブラウザ 18/19 は通ったが、
  **`tests/export-trim.spec.ts` が落ちた** — 1.1s〜2.1s (30fps) の区間書き出しが
  **29 フレーム** (期待 30)。**1 フレーム落ち = データ損失**であり、
  `export/CLAUDE.md`「データ損失は致命的」に反するため採用しない。
- **境界を特定した (二分探索の実測)**: 1.55.0 は 2/2 緑、**1.56.0 以降 (1.56〜1.60 全て)
  が 29 フレーム**。壊れたのは **1.56.0** — 公式ノートで「任意区間のコピー変換
  (再エンコード無しのトリム)」と「負のタイムスタンプ対応」が入った版と一致する。
  つまり `Conversion` のトリム経路が変わった疑いが強い。
- 未解明: 先頭/末尾どちらのフレームが落ちるか、意図された仕様変更か退行か。
  次の一手: 1.56.0 で出力の先頭/末尾タイムスタンプを取得して落ちる側を特定し、
  `ConversionCopyOptions.boundaryTolerance` (1.58) 等の新オプションで復元できるか、
  上流 issue 化すべきかを判断する。仕様変更なら期待値ではなく製品側を直す。
- 当面の安全策: 1.55.x までは緑。1.56 以降へは上記が解けるまで上げない。
- 教訓: 実ブラウザの厳密フレーム数テストが、依存更新の**静かな退行**を捕まえた。

### 2. `importExternalTexture` によるゼロコピー化 — **保留 (検証手段なし)**
- 根拠: WebCodecs→WebGPU は `GPUExternalTexture` がコピー無しの正道
  ([WebCodecs Fundamentals](https://webcodecsfundamentals.org/basics/rendering/) /
  [Chrome Intent to Ship](https://groups.google.com/a/chromium.org/g/blink-dev/c/QLCfazM8XLQ))。
  現状 `render/webgpu-engine.ts` は `copyExternalImageToTexture` (コピーあり)。
- 保留理由: コンテナの Chromium に GPU が無く、GPU 面の正しさは CI/jsdom で
  検証できない (`render/CLAUDE.md`)。**検証できない変更は出荷しない。**
  実 GPU 環境で ①生存期間 (`importExternalTexture` の結果はそのタスク内のみ有効)
  ②フレーム `close()` のタイミング ③bind group の再作成コスト を計測してから。

### 3. 書き出しの `bitrateMode` 明示 — **保留 (実測が先)**
- `export/export-engine.ts` は `latencyMode:'quality'` のみで `bitrateMode` は
  実装既定に任せている (`core/webcodecs-pipeline.ts` は指定可能)。
- 既定挙動の実測 (ファイルサイズの環境差) が未了。**推測で `constant` にしない。**

## 参照
- [webcodecs-utils](https://github.com/sb2702/webcodecs-utils)
- [WebCodecs Fundamentals — Rendering](https://webcodecsfundamentals.org/basics/rendering/)
- [Mediabunny releases](https://github.com/Vanilagy/mediabunny/releases)
