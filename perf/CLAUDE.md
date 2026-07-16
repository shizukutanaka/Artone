# perf/ — パフォーマンスモニタ / 自動品質調整

## リスク
- モニタ自体がパフォーマンスを落とさないこと

## ルール
- WebGPU timestamp query で GPU 計測\n- AutoQualityAdjuster は 0.25-1.0 のスケール\n- Pro tier のみ表示 (課金ゲートではない。`app/design-system.ts` の `FeatureTier` — ユーザーが選ぶ経験レベルに基づく UI 段階的開示。認証/課金機構は存在しない)

## ファイル
- performance-monitor.ts
