# project/ — プロジェクト永続化 (IndexedDB)

## リスク
- データ損失は致命的。自動バックアップ必須\n- スキーマバージョニングで後方互換

## ルール
- save は recovery/ と連携\n- プロジェクトファイル形式は 10 年読める設計

## ファイル
- project-manager.ts
