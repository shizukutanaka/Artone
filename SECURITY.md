# Security Policy

## サポート対象バージョン

| Version | Supported |
|---|---|
| 3.x | ✅ |
| 2.x | ⚠️ 重大脆弱性のみ |
| 1.x | ❌ |

## 脆弱性報告

セキュリティ脆弱性を発見した場合、**公開 Issue では報告しない** で。

### 報告方法

GitHub Security Advisory: [Report a vulnerability](https://github.com/shizukutanaka/artone/security/advisories/new)

### 含めるべき情報

- 脆弱性の種類
- 影響範囲
- 再現手順
- PoC コード (該当時)
- 修正案 (任意)

### 対応 SLA

| 重要度 | 初動 | パッチ |
|---|---|---|
| Critical | 24h | 7日 |
| High | 72h | 14日 |
| Medium | 1週間 | 30日 |
| Low | 2週間 | 次リリース |

## セキュリティ機能

- **CSP (Content Security Policy)** 厳格設定
- **COOP/COEP** クロスオリジン分離
- **Subresource Integrity** 全外部スクリプト
- **WASM サンドボックス** プラグイン分離
- **権限モデル** プラグイン明示同意
- **HTTPS 強制** 本番環境

## 既知の制限

- WebGPU shader compilation は信頼境界外コードを含む可能性
- Service Worker の更新には注意 (古い SW がキャッシュされる)
- IndexedDB のデータは暗号化されない (ブラウザのストレージ暗号化に依存)

## 開発者向け

- `npm audit` 定期実行
- 依存ライブラリの脆弱性スキャン (Dependabot)
- secret スキャン (gitleaks)
- SAST (semgrep / CodeQL)

## 謝辞

報告者は許可があれば SECURITY.md に記載。
