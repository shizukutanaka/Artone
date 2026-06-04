# scripts/

CI / 品質ゲートのスクリプト群。

## ファイル

- `design-system-check.sh` — 10項目の整合性チェック (`npm run lint:design`)
- `syntax-check.mjs` — TypeScript 構文チェッカー (`npm run syntax`)

## design-system-check.sh の10項目

```
[1/10] Hardcoded colors        — design-system.ts 以外の色直書きゼロ
[2/10] Duplicate theme constants
[3/10] Design token compliance — 新規ファイルの spacing token
[4/10] Orphan source files     — ルートへの孤立ファイルゼロ
[5/10] Test file placement     — tests/ 外のテストゼロ
[6/10] Dead code detection     — 未配線 feature モジュールゼロ
[7/10] CLAUDE.md coverage      — 全モジュールに知識文書
[8/10] Raw localStorage        — safeStorage 経由のみ
[9/10] console.* in production — logger.ts 経由のみ
[10/10] TypeScript syntax check — syntax-check.mjs に委譲
```

## Gotchas (失敗パターンの蓄積)

### 文字列ベースの lint だけでは構文破壊を検出できない (重要)
2026-06、179個の TypeScript 構文エラーが蓄積していた。原因は sed/python の一括置換:
- `console.warn(` → `log.warn(` 置換でバッククォートが欠落 (`log.warn(text ${x}\``)
- `compileShaders` 分割でコメント行とコード行が連結
- 関数移動 (`uuid()`) でメソッド本体の残骸
- `str_replace` で describe ブロックが重複

`design-system-check.sh` は文字列パターンしか見ないため、これらを**すべて見逃していた**。
「CI 9/9 PASS」は構文的に壊れたコードでも通っていた。

**対策**: `syntax-check.mjs` を [10/10] に追加。TypeScript パーサーで全 .ts を AST パースし、
バッククォート欠落・括弧不整合・行連結・ブロック重複を検出する。

**運用ルール**: sed/python で一括置換したら必ず `npm run syntax` を実行する。

### syntax-check.mjs の TypeScript 解決順
1. `./node_modules/typescript`
2. `/tmp/node_modules/typescript` (CI 一時インストール)
3. フォールバック: 文字列/コメント/テンプレート除去後の括弧バランスチェック

TypeScript が無い環境でもフォールバックで最低限の括弧不整合は検出できる。
