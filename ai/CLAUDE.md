# ai/ — AI エフェクト (ローカル Transformers.js / WebGPU)

## リスク
- モデルサイズが大きい。初回ダウンロードの UX 設計が重要\n- GPU メモリ管理

## ルール
- 外部 API 送信禁止 (ローカル処理完結)\n- モデルは IndexedDB にキャッシュ\n- Pro tier のみ表示

## ファイル
- ai-effects-engine.ts
