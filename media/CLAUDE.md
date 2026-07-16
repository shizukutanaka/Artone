# media/ — メディアブラウザ / プロキシワークフロー

## リスク
- ファイル I/O が多い。IndexedDB 容量制限に注意\n- プロキシ生成は WebCodecs で非同期

## ルール
- サムネイル生成は OffscreenCanvas\n- ファイルサイズ表示は human-readable

## ファイル
- media-browser.ts
- proxy-workflow.ts

## 削除履歴
- `proxy-manager.ts`(2026-07 削除) — `proxy-workflow.ts` と重複する
  インメモリ・`setTimeout`シミュレーションの死んだ実装。`app/main.ts` は
  `proxy-workflow.ts` の `ProxyWorkflow` のみを配線しており、こちらは
  どこからもimportされていなかった。
