# Security Review Skill

## 起動条件
- 依存ライブラリ追加/更新
- リリース前
- 月次定期スキャン

## 手順

### 1. SBOM 生成
```bash
npm run sbom
```
出力: `sbom.json` (CycloneDX 1.5), `sbom.spdx` (SPDX 2.3)

### 2. CVE スキャン
- `npm audit --audit-level=high` 実行
- `security/cve-database.ts` のローカル DB と照合
- critical/high あれば即修正

### 3. ライセンス監査
- `LicenseAnalyzer.summarize()` でカテゴリ集計
- strong-copyleft (GPL/AGPL) が含まれていないか確認
- unknown ライセンスは要調査

### 4. 修正方針
- critical CVE: 24h 以内
- high CVE: 7日以内
- medium CVE: 30日以内
- low CVE: 次リリース

## チェックリスト

- [ ] `npm audit` pass (critical/high ゼロ)
- [ ] SBOM 最新版生成
- [ ] ライセンス互換性 OK
- [ ] CVE DB 更新確認
- [ ] 不要依存削除検討

## 出力
- `security/audit-report.md` に月次サマリ
- リリースノートに脆弱性修正記載
