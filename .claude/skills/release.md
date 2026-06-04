# Release Skill

## 起動条件
- ユーザーがリリース依頼
- v X.Y.Z タグ作成

## チェックリスト

### 1. コード品質
- [ ] `npm test` 全 pass
- [ ] `npm run lint` 警告ゼロ
- [ ] `npm run typecheck` エラーゼロ
- [ ] `npm audit` 脆弱性ゼロ (HIGH/CRITICAL)
- [ ] カバレッジ 80%+ 維持

### 2. ビルド
- [ ] `npm run build` 成功
- [ ] バンドルサイズ前回比較 (+10%以下)
- [ ] Source map 生成
- [ ] Treeshaking 有効

### 3. ドキュメント
- [ ] README.md 最新
- [ ] CHANGELOG.md に変更記載
- [ ] API ドキュメント生成
- [ ] マイグレーションガイド (破壊的変更時)

### 4. バージョニング
- [ ] `package.json` の version 更新
- [ ] `CHANGELOG.md` に日付追加
- [ ] semver 準拠
  - MAJOR: 破壊的変更
  - MINOR: 後方互換機能追加
  - PATCH: バグ修正

### 5. テスト
- [ ] E2E (Playwright) 全 pass
- [ ] クロスブラウザ確認 (Chrome/Firefox/Safari)
- [ ] モバイル動作確認 (iOS/Android)
- [ ] パフォーマンス計測

### 6. セキュリティ
- [ ] 依存ライブラリ最新化
- [ ] 既知脆弱性ゼロ
- [ ] secrets 漏洩スキャン

### 7. デプロイ
- [ ] Cloudflare Pages デプロイ確認
- [ ] CDN cache 無効化
- [ ] DNS / SSL 確認
- [ ] ロールバック手順確認

### 8. 公開
- [ ] git tag `vX.Y.Z`
- [ ] GitHub Release 作成
- [ ] CHANGELOG コピー
- [ ] アセット添付 (binaries / source.tar.gz)
- [ ] ユーザー通知 (newsletter / discord / etc)

### 9. 事後
- [ ] 監視ダッシュボード確認 (24h)
- [ ] エラー率変化監視
- [ ] パフォーマンス回帰確認

## ロールバック手順
1. 前バージョン tag を deploy
2. CDN cache 無効化
3. ユーザーに通知
4. 原因調査 → ホットフィックス
