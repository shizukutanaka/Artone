# Performance Benchmark Review Skill

## 起動条件
- パフォーマンスクリティカル変更
- リリース前
- 月次ベースライン更新検討

## 手順

### 1. 現状計測
```bash
npm run bench
```

### 2. ベースライン比較
- critical 退行: 即修正必須
- major 退行: 原因調査・承認必要
- minor 退行: 累積監視

### 3. プロファイリング
```bash
# Chrome DevTools Performance タブ
# Lighthouse Performance audit
```

ホットパス特定 → 最適化候補リストアップ

### 4. 最適化指針
- Carmack: 計測根拠ある最適化のみ
- ゼロコピー優先 (ArrayBuffer 共有)
- WebGPU > WebAssembly > Worker > メインスレッド
- メモリアロケーション最小化 (GC pause 回避)

### 5. ベースライン更新
```bash
npm run bench:baseline
```
コミット時にベースライン.json を含める。

## チェックリスト

- [ ] critical 退行ゼロ
- [ ] p95/p99 も評価
- [ ] フレーム予算守られている (16ms @60fps)
- [ ] メモリリーク検出
- [ ] CPU/GPU 使用率妥当

## 不変
- ベンチは決定論的に (乱数 seed 固定)
- 平均だけで判断しない (p95/p99 重視)
- リリースごとにベースライン更新
