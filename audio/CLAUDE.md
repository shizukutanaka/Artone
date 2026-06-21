# audio/ — リアルタイム制約ゾーン

## 厳守事項
- AudioWorklet 内で GC を発生させない (オブジェクト生成回避)
- バッファサイズ固定 (128/256/512/1024)
- メインスレッドとの通信は MessagePort のみ
- ロック・mutex 禁止 (lock-free ring buffer 使用)

## レイテンシ目標
- 入力 → 出力: < 10ms (プロ用途)
- プラグイン処理: < 5ms / プラグイン
- メーター更新: 60fps 維持

## メモリ
- AudioWorkletProcessor: 起動時のみアロケート
- 動的アロケート禁止 (process() 内)
- SharedArrayBuffer で共有メモリ通信

## テスト要求
- カバレッジ 95%+
- レイテンシ計測テスト
- グリッチ検出テスト (XRun/dropouts)
- 長時間連続再生テスト (24時間)

## サラウンド
- 5.1/7.1/Atmos の channel mapping は ITU-R BS.775 準拠
- HRTF データは public domain のみ使用
