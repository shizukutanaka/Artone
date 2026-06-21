# Design System Migration Guide

## 対象 — 重複テーマ定数を持つファイル

| ファイル | 定数名 | 行数 | 対応 |
|---|---|---|---|
| `app/Inspector.tsx` | `const T = {...}` | L12 | 削除 → `import { ds, color } from './design-system'` |
| `app/TimelineView.tsx` | `const T = {...}` | L12 | 同上 |
| `app/DiagnosticPanels.tsx` | `const T = {...}` | L12 | 同上 |
| `app/MediaBrowser.tsx` | `const T = {...}` | L11 | 同上 |
| `app/ArtoneUI.tsx` | `const THEME = {...}` | L17 | 同上 |

## マイグレーション手順

1. 各ファイルの先頭に追加:
```typescript
import { ds, color, space, radius, motion } from './design-system';
```

2. ローカル定数 `T` / `THEME` を削除

3. 置換ルール:
```
T.bg         → color.surface1
T.bgPanel    → color.surface2
T.bgInput    → color.surface4
T.border     → color.border
T.textPrimary → color.textPrimary
T.textSecondary → color.textSecondary
T.textMuted  → color.textTertiary
T.brand      → color.brand
T.success    → color.positive
T.warning    → color.caution
T.error      → color.destructive
THEME.action → color.interactive
THEME.borderFocus → color.borderFocus
```

4. style={{}} 内のマジックナンバーを space[N] に置換:
```
padding: '0 16px'  → padding: `0 ${space[4]}px`
gap: 8              → gap: space[2]
borderRadius: 8     → borderRadius: radius.md
```

5. font 直指定を ds.text() に:
```
fontSize: 14, fontWeight: 600 → ...ds.text('title')
```

## 検証

`tests/apple-design.test.ts` で:
- 色の重複ゼロ
- WCAG AAA コントラスト
- 4px グリッド整合
