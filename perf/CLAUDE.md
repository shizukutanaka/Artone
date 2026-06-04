# perf/ — パフォーマンスモニタ / 自動品質調整

## リスク
- モニタ自体がパフォーマンスを落とさないこと

## ルール
- WebGPU timestamp query で GPU 計測\n- AutoQualityAdjuster は 0.25-1.0 のスケール\n- Pro tier のみ表示

## ファイル
- performance-monitor.ts
