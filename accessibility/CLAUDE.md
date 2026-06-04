# accessibility/ — WCAG 2.1 AAA 監査

## Why
10年運用のアクセシビリティ品質維持。多言語対応プロダクトとして必須。

## ルール
- カラー判定は WCAG 公式輝度計算式を使う
- AAA を目標 (テキスト 7:1 / 大文字 4.5:1)
- 重大度: critical (FAIL) / major (AA only) / minor (改善余地)
- DOM 走査は document.body から (root 指定可)
- aria-* 属性は必須要素で必ず検査
- 言語属性 (lang) は <html> 必須

## ファイル
- `wcag-auditor.ts` - DOM 監査エンジン

## CI 連携
- E2E テスト後に `a11y.auditor().audit()` を呼ぶ
- critical issues > 0 で fail
- レポートは Playwright artifact として保存

## 不変
- 自動監査は補助。人手レビューを置き換えない
- スクリーンリーダーでの実機テストは別途必須
