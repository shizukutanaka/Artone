# media/ — メディアブラウザ / プロキシ生成 / プロキシワークフロー

## リスク
- ファイル I/O が多い。IndexedDB 容量制限に注意\n- プロキシ生成は WebCodecs で非同期

## ルール
- サムネイル生成は OffscreenCanvas\n- ファイルサイズ表示は human-readable

## ファイル
- media-browser.ts
- proxy-manager.ts
- proxy-workflow.ts
