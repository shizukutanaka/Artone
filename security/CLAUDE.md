# security/ — SBOM + サプライチェーン監査

## Why
10年運用のセキュリティ基盤。Executive Order 14028 / SLSA 準拠を意識。
依存ライブラリの脆弱性を継続的に検出。

## ルール
- SBOM は CycloneDX 1.5 / SPDX 2.3 両形式生成
- ライセンスは SPDX 識別子を使う
- CVE データベースは外部から注入 (オフライン動作)
- 強コピーレフト (GPL/AGPL) は MIT プロジェクトに含めない
- critical CVE は自動的に CI 失敗

## ファイル
- `sbom.ts` - SBOM 生成 + ライセンス分析 + CVE スキャナ

## 運用
1. ビルド時: SBOM を artifact として生成
2. CI: critical/high CVE があれば fail
3. リリース時: SBOM をリリース成果物に同梱
4. 定期: 月次で CVE データベース更新

## 不変
- ローカル動作のみ。外部 API 送信なし (プライバシー)
- ハッシュは SHA-256 以上を使う
- リリース成果物は署名する (将来 cosign 対応)
