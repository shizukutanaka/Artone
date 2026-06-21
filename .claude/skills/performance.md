# Performance Optimization Skill

## 起動条件
- ユーザーが速度改善依頼
- パフォーマンス計測で目標未達
- frametime > 16.67ms 検出

## 原則 (Carmack)
**計測なくして最適化なし。推測でなく実測。**

## 手順

### 1. 計測
- DevTools Performance プロファイル
- `PerformanceMonitor` モジュール使用
- ボトルネック上位 3 箇所特定
- 数値で目標設定 (例: 16ms → 10ms)

### 2. 分析
- CPU バウンド / GPU バウンド / I/O バウンド どれか
- アロケーション頻度
- キャッシュミス
- 同期 / 非同期境界

### 3. 改善優先順位
1. **アルゴリズム改善** (O(n²) → O(n log n))
2. **データ構造変更** (Array → Map / TypedArray)
3. **並列化** (Web Worker / GPU compute)
4. **キャッシュ追加** (memoization / LRU)
5. **遅延評価** (lazy / virtual scroll)
6. **バッチ処理** (rAF / microtask)

### 4. 実装
- 1箇所ずつ変更 + 計測
- 改善幅が予測通りか確認
- 副作用 (メモリ増加 / コード複雑化) を評価

### 5. 検証
- ベンチマーク回帰なし
- 全テスト pass
- 様々な入力サイズで確認 (small / medium / large)
- 実機 (低スペック含む) で確認

## 共通パターン

### React
- `useMemo` / `useCallback`
- `React.memo` で再レンダー抑制
- virtualized list
- code splitting

### WebGPU
- Bind group 再利用
- バッファ pre-allocation
- compute pass バッチ化
- timestamp query で計測

### WebCodecs
- Worker でデコード
- frame ring buffer
- HWアクセラレーション活用

### メモリ
- WeakRef / WeakMap
- TypedArray pool
- destroy() 漏れ修正
