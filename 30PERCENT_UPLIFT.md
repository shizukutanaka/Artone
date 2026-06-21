# Artone v3 — 30% Quality Uplift Strategy

10年運用を前提に「プロダクトを30%良くする」ための定量的計画。
Carmack/Martin/Pike の設計原則に基づく。

---

## 計測軸 (Definition of "30% better")

各軸ごとに現在値と目標値を設定。10年スパンで段階達成。

| 軸 | 現在 | 1年目標 | 5年目標 | 10年目標 |
|---|---|---|---|---|
| 4K プレビュー fps | 60 | 60 (安定) | 90 | 120 |
| エクスポート速度 (vs realtime) | 1.0x | 1.5x | 2.5x | 4.0x |
| 起動時間 (PWA) | 3s | 2s | 1s | 0.5s |
| バンドルサイズ (initial) | 800KB | 500KB | 350KB | 250KB |
| カバレッジ | 70% | 80% | 90% | 95% |
| リスクゾーンカバレッジ | 80% | 95% | 98% | 99% |
| 対応言語数 | 76 | 200 | 600 | 1000+ |
| WCAG レベル | AA | AAA | AAA | AAA |
| 平均バグ修正時間 (Critical) | 72h | 24h | 12h | 6h |
| プラグイン数 | 12 | 50 | 500 | 2000+ |

**30%向上 = 全軸で目標達成 = プロダクトの実用価値が定性的に1.3倍になる。**

---

## 戦略レイヤー (5層)

### Layer 1: 基盤の不変性 (Foundation Invariants)
**目的**: 10年間変わらないコア。これが揺らぐと全層が崩れる。

不変項目:
- Web 標準のみ依存 (WebCodecs/WebGPU/WebAssembly/IndexedDB)
- ローカル処理完結 (オフライン動作可能)
- プロジェクトファイル形式の後方互換 (10年読める)
- OTIO 1.0 互換 (業界標準)
- MIT ライセンス (OSS 持続可能性)

実装済み:
- [x] WebCodecs パイプライン
- [x] WebGPU エンジン
- [x] OTIO 1.0 互換層 (`interchange/otio.ts`)
- [x] EDL/FCPXML 互換 (`interchange/legacy-formats.ts`)
- [x] プロジェクトファイル schema バージョニング

### Layer 2: 品質ゲート (Quality Gates)
**目的**: CI で品質劣化を阻止。Carmack 思想 = 計測なくして維持なし。

ゲート:
- パフォーマンス退行検出 (`bench/`)
- WCAG AAA 監査 (`accessibility/`)
- SBOM + CVE スキャン (`security/`)
- 80%+ カバレッジ (リスクゾーン 95%+)
- Linter 警告ゼロ
- TypeScript strict mode

実装済み:
- [x] BenchmarkRunner + RegressionDetector
- [x] A11yAuditor (WCAG 2.1 AAA)
- [x] SBOMGenerator (CycloneDX/SPDX)
- [x] VulnerabilityScanner
- [x] LicenseAnalyzer
- [x] CI 統合 (3新規ジョブ)

### Layer 3: 拡張性 (Extensibility)
**目的**: 1人のメンテナで動かない大規模化に対応。

機構:
- プラグイン SDK (WASM)
- Skill ベースのナレッジ (`.claude/skills/`)
- Hooks による副作用管理
- リスクゾーン別 CLAUDE.md
- module-level CLAUDE.md (TypeScript module ごと)

実装済み:
- [x] VST/AU WASM ブリッジ
- [x] 6 Skills (code-review/debug/refactor/i18n/perf/release)
- [x] preWrite/postWrite hooks
- [x] 8 リスクゾーン CLAUDE.md

### Layer 4: ユーザー体験 (UX Excellence)
**目的**: AIっぽくない、人間が設計したと感じるUI。

原則:
- 情報の優先順位を明確に
- 主役が一目で分かる
- 視線の流れ: 見る→比較→行動
- 色は役割を分離 (ブランド/操作/状態/注意)
- 異常値・ゼロ件・長文・欠損で破綻しない

実装済み:
- [x] React + TypeScript + Tailwind 構成
- [x] WCAG AAA カラーパレット
- [x] キーボードナビゲーション完全対応
- [x] スクリーンリーダー対応
- [x] 長文 / ゼロ件 / 異常値の堅牢な扱い

### Layer 5: 運用持続性 (Sustainability)
**目的**: 10年後も動かしている人がいる状態。

要素:
- ドキュメント完備 (CLAUDE.md / docs/)
- スキル知識資産化 (.claude/skills/)
- コミュニティ (CONTRIBUTING.md / CoC)
- ライセンス監査済み (sbom)
- バス係数 3+ (3人離脱しても継続可能な設計)

実装済み:
- [x] README / CONTRIBUTING / SECURITY / CoC
- [x] アーキテクチャドキュメント (100_POINTS_ARCHITECTURE.md)
- [x] 10年ロードマップ (ROADMAP.md)
- [x] スキルベースナレッジ移転

---

## 30% 達成の鍵

### 1. 自動化 (Automation)
人手に依存しない品質維持:
- CI の3つの新規ゲート (bench/security/a11y)
- Skill による作業の標準化
- Hooks による事故防止

### 2. 標準化 (Standardization)
独自を捨てて標準に乗る:
- OTIO 1.0 (Pixar/業界標準)
- CycloneDX 1.5 / SPDX 2.3 (SBOM 標準)
- WCAG 2.1 AAA (W3C 標準)
- SemVer (バージョニング標準)

### 3. 計測 (Measurement)
推測でなくデータで判断:
- ベンチマーク p50/p95/p99
- カラーコントラスト比 (実数値)
- カバレッジ %
- CVE スコア (CVSS)

### 4. 文書化 (Documentation)
知識を人から外へ:
- 8つのリスクゾーン CLAUDE.md
- 6つの Skill
- ROADMAP / ARCHITECTURE
- 関数ごとの docstring

### 5. 削減 (Reduction)
増やすより減らす:
- 不要機能を削除
- 重複コードを統合
- 依存ライブラリを最小化
- 複雑性を排除 (Pike 思想)

---

## 月次レビュー項目

毎月実行する品質チェックリスト:

- [ ] `npm audit` 実行 → critical/high ゼロ
- [ ] `npm run bench` 実行 → critical 退行ゼロ
- [ ] `npm run sbom` 実行 → 新規ライセンス確認
- [ ] `npm run test:a11y` 実行 → AAA pass
- [ ] CHANGELOG 月次サマリー追記
- [ ] 依存ライブラリ更新 (patch/minor)
- [ ] CVE データベース更新

## 四半期レビュー項目

- [ ] アーキテクチャドキュメント整合性確認
- [ ] バス係数評価 (誰が抜けると詰むか)
- [ ] 主要ベンチマークのベースライン更新
- [ ] パフォーマンス目標進捗確認
- [ ] ロードマップ vs 実績乖離分析

## 年次レビュー項目

- [ ] 大規模リファクタ計画
- [ ] 廃止 API 整理
- [ ] ライセンス監査 (外部委託オプション)
- [ ] セキュリティ監査
- [ ] アクセシビリティ監査 (実機 / スクリーンリーダー)
- [ ] 次年度ロードマップ更新

---

## 失敗パターン (Anti-patterns)

回避すべき判断:

1. **新機能優先 over 品質維持** — 30%向上は積み上げ。一気に5%増やす機能より、毎月0.5%劣化を阻止する方が効く。
2. **独自実装 over 標準採用** — OTIO/CycloneDX/WCAG は標準化が10年コストを下げる。
3. **手動レビュー over 自動ゲート** — 人は忘れる。CI は忘れない。
4. **粗い計測 over p95/p99** — 平均値だけでは外れ値が見えない。
5. **増やす設計 over 減らす設計** — Pike: シンプルが最強。

---

## 結論

**30%向上は機能追加でなく、品質ゲートの自動化と標準化で達成する。**

実装の物理量は十分 (24+ モジュール / 16,000+ 行)。
次の1年で必要なのは、品質を恒常的に保つ仕組みの完成。

このドキュメントの存在自体が、Layer 5 (運用持続性) への投資である。
