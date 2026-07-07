# scopes/ — Waveform / Vectorscope / Histogram / RGB Parade

## リスク
- リアルタイム描画。フレームドロップ禁止

## ルール
- Canvas 2D で描画 (WebGL 不要)\n- BT.709 色空間前提\n- Pro tier のみ表示 (課金ゲートではない。`app/design-system.ts` の `FeatureTier` による UI 段階的開示)

## ファイル
- video-scopes.ts
