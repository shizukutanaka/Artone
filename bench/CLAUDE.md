# bench/ — パフォーマンス退行検出

## Why
10年運用で性能劣化を阻止するゲート。Carmack 思想:
計測なくして最適化なし、退行検出なくして維持なし。

## ルール
- ベンチは決定論的に。乱数を使うなら seed 固定
- ウォームアップ必須 (3回以上)
- 反復回数は自動 (probe で決定) もしくは固定
- 統計値は p50/p95/p99 含める。平均だけで判断しない
- ベースラインは Git で管理 (`bench/baseline.json`)
- CI で `regressions.severity === 'critical'` があれば失敗

## ファイル
- `regression-detector.ts` - 退行検出エンジン
- `standard-suite.ts` - 標準ベンチマーク
- `baseline.json` - 現在のベースライン (Git 管理)

## 運用
1. リリース前: `npm run bench` でベースライン更新
2. PR ごと: CI で現在実行 → ベースライン比較
3. major 退行: 明示的承認必須
4. critical 退行: 自動 fail
