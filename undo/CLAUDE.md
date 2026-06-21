# undo/ — 履歴管理 (Command Pattern / ブランチ)

## リスク
- 全編集操作の undoable 保証が必要\n- メモリ使用量が無制限に増えないよう管理

## ルール
- 新規操作は必ず CommandFactory に追加\n- マージ可能コマンド (500ms ウィンドウ)\n- IndexedDB 永続化

## ファイル
- history-manager.ts
