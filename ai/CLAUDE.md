# ai/ — AI エフェクト (現状: モデル推論は未実装)

## 現状 (2026-07 検証)
`@xenova/transformers` は package.json の依存関係にあり `vite.config.ts` の
`optimizeDeps.exclude` コメントに名前が出るだけで、アプリケーションコードの
どこからも import されていない。`ai-effects-engine.ts` の内訳:
- `loadModel()` — BodyPix/SAM2/Face Mesh/Pose/Style Transfer/ESRGAN/Whisper
  という実在モデルをカタログ定義しているが、中身は `setTimeout` ループで
  進捗 0→100% を演じるだけの偽実装。実推論・IndexedDB キャッシュは無い。
- `removeBackground()` — 実際は境界画素の背景色推定 + マハラノビス距離に
  よるクラシック CV(ヒューリスティック背景差分)。モデルを一切参照しない。
  効果自体は動作するが「AI」ではない。
- `transcribe()` — 唯一誠実な実装。外部注入する `SpeechRecognizer` に完全
  委譲し、未設定なら明示的に例外を投げる(静かな no-op を避ける設計)。
  推論本体はこのインターフェースの実装側(未提供)に依存する。

root CLAUDE.md の WHY 冒頭「100%ローカルAI」は、現時点でこのモジュールに
関する限り実装されていない。要判断: (a) 実際に Transformers.js を配線する、
(b) 「AI」を名乗らずクラシック CV エフェクトとして再定義する、
(c) ロードマップ機能として明示的に位置づける。

## 元の設計方針 (実装時に維持すべき制約)
- 外部 API 送信禁止 (ローカル処理完結)
- モデルサイズが大きい。初回ダウンロードの UX 設計が重要
- GPU メモリ管理
- モデルは IndexedDB にキャッシュ (未実装)
- 「Pro tier のみ表示」は課金ゲートではなく `app/design-system.ts` の
  `FeatureTier` による UI 段階的開示

## ファイル
- ai-effects-engine.ts

