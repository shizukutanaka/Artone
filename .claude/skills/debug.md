# Debug Skill

## 起動条件
- バグ報告
- テスト失敗
- パフォーマンス劣化

## 手順

### 1. 再現
- 最小再現ケース作成
- 環境情報収集 (OS / Browser / GPU / RAM)
- ログ / スタックトレース収集
- failing test を先に書く

### 2. 仮説立案
- 直近の変更を git log で確認 (`git log --since="1 week"`)
- bisect で原因コミット特定 (`git bisect`)
- 関連モジュールのテストを実行

### 3. 原因特定
- print デバッグでなく debugger 使用
- DevTools Performance タブで実測
- メモリリークは Heap Snapshot
- GPU 問題は WebGPU validation layer

### 4. 修正
- 原因を一行で説明できるか確認
- テストが pass することを確認
- リグレッションテスト追加

### 5. 検証
- 修正前と後でベンチマーク比較
- 関連テスト全 pass
- ユーザー報告条件で動作確認

### 6. ドキュメント
- CHANGELOG: `fix: ...`
- post-mortem (重大バグ時)
- 再発防止策

## バグ分類

### CRITICAL
- データ損失
- セキュリティ脆弱性
- 起動不能
→ 即時ホットフィックス

### MAJOR
- 主要機能不動作
- パフォーマンス著しい劣化
→ 次パッチリリース

### MINOR
- 副次機能不具合
- UI 表示崩れ
→ 通常リリースサイクル

### TRIVIAL
- 表示文字列誤り
→ Good first issue
