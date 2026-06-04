# Accessibility Review Skill

## 起動条件
- UI コンポーネント追加/変更
- リリース前
- 四半期定期監査

## 手順

### 1. 自動監査
```bash
npm run test:a11y
```

### 2. コントラスト確認
- `ColorContrast.contrast()` で比率計算
- 通常テキスト: 7:1 以上 (AAA)
- 大文字 (18pt+ or 14pt+ bold): 4.5:1 以上
- UI コンポーネント: 3:1 以上

### 3. キーボード操作確認
- Tab で全インタラクティブ要素にアクセス可能
- Esc でモーダル/ポップアップ閉じる
- 矢印キーで複合UI ナビゲート

### 4. スクリーンリーダー確認
- aria-label / aria-labelledby
- role 属性
- live region (動的更新)
- alt 属性 (画像)

### 5. 言語属性
- `<html lang="...">` 必須
- 言語切替時に動的更新

## チェックリスト

- [ ] WCAG AAA pass (`npm run test:a11y`)
- [ ] critical issues ゼロ
- [ ] 全インタラクティブ要素に accessible name
- [ ] フォーカス可視 (outline 必須)
- [ ] 色のみで情報伝達してない
- [ ] アニメーション無効化対応 (prefers-reduced-motion)

## 不変
- 自動監査は補助。実機テスト (NVDA/VoiceOver/JAWS) は別途必須
- 多言語のテキスト方向 (RTL) も検証
