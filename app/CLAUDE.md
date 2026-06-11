# app/ — UI シェル + デザインシステム + エントリポイント

## リスク
- design-system.ts を変更すると全 UI に波及\n- shell.tsx の stale closure に注意 (useState 関数型更新必須)\n- entry.tsx が唯一の React root

## ルール
- 色は design-system.ts からのみ import\n- px 直書き禁止 (新規ファイル)\n- EngineProvider 経由でエンジンにアクセス\n- localStorage は safeStorage() 経由

## ファイル
- DiagnosticPanels.tsx
- Inspector.tsx
- MediaBrowser.tsx
- TimelineView.tsx
- capabilities.ts
- command-palette.tsx
- design-system.ts
- drop-zone.tsx
- engine-context.tsx
- entry.tsx
- error-boundary.tsx
- first-run.tsx
- logger.ts
- main.ts
- shell.tsx
- shortcut-manager.ts
- sw-manager.ts
- utils.ts
