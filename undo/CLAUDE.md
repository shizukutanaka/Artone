# undo/ — 履歴管理 (Command Pattern / ブランチ)

## リスク
- 全編集操作の undoable 保証が必要\n- メモリ使用量が無制限に増えないよう管理

## ルール
- 新規操作は必ず CommandFactory に追加\n- マージ可能コマンド (500ms ウィンドウ)\n- IndexedDB 永続化

## 既知の制約 (2026-07 検証)
「IndexedDB 永続化」は position/branches などのメタデータのみ。
`loadFromDB()`(history-manager.ts:690 付近)・`switchBranch()`(:849 付近)
のコメントが明記する通り、Command 本体(execute/undo の実関数)は永続化・
復元されない。リロード後は `position` の数値だけ残り、実際に undo/redo
できる状態とは一致しない(見かけ上は「N手戻せる」ように見えて実際には
戻せない可能性がある)。フル機能の永続化には、コマンドをシリアライズ
可能な操作記述(タグ+パラメータ)として再設計する必要がある。

## ファイル
- history-manager.ts
