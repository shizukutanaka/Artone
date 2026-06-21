# Contributing to Artone v3

## 環境構築

```bash
git clone https://github.com/shizukutanaka/artone
cd artone
npm install
npm run dev
```

## ワークフロー

1. Issue 作成 / 既存 Issue にアサイン
2. ブランチ作成: `feat/xxx` / `fix/xxx` / `refactor/xxx`
3. 実装 + テスト
4. `npm test` `npm run lint` `npm run typecheck` 全 pass
5. PR 作成
6. コードレビュー
7. マージ

## コミット規約

[Conventional Commits](https://www.conventionalcommits.org/) 準拠。

| プレフィックス | 用途 |
|---|---|
| `feat:` | 機能追加 |
| `fix:` | バグ修正 |
| `refactor:` | リファクタリング |
| `perf:` | パフォーマンス改善 |
| `test:` | テスト追加・修正 |
| `docs:` | ドキュメント |
| `chore:` | ビルド・ツール |
| `style:` | フォーマット |

例: `feat(timeline): add ripple delete shortcut`

## コーディング規約

[`CLAUDE.md`](./CLAUDE.md) 参照。

要点:
- 関数引数 ≤ 3
- ネスト深さ ≤ 3
- `any` 禁止
- 全関数 docstring
- 文字列ハードコード禁止 (`t('key')` 経由)

## テスト

- 新機能には単体テスト必須
- カバレッジ 80%+ (リスクゾーン 95%+)
- E2E 影響時は Playwright テスト追加

## リスクゾーン

以下のディレクトリは特別な注意が必要:

| ディレクトリ | リスク |
|---|---|
| `recovery/` | データ損失 |
| `plugins/` | セキュリティ |
| `audio/` | リアルタイム制約 |
| `render/` | GPU リソース |

各ディレクトリの `CLAUDE.md` を熟読してから変更。

## レビュー基準

- [ ] 全テスト pass
- [ ] Linter 警告ゼロ
- [ ] TypeScript エラーゼロ
- [ ] CHANGELOG.md 更新
- [ ] 関連ドキュメント更新
- [ ] 既存類似機能の重複なし
- [ ] 計測根拠あるパフォーマンス改善 (該当時)

## 行動規範

[`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md) 参照。

## ライセンス

PR は MIT ライセンスで公開されることに同意。
