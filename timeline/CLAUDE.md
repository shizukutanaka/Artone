# timeline/ — マグネティックタイムライン / マルチカム / ネスト / テキスト編集

## リスク
- 主役 UI。パフォーマンスが最重要\n- ドラッグ操作中に GC を発生させない

## ルール
- フレーム計算は整数のみ (浮動小数点禁止)\n- クリップ操作は全て Command Pattern (undo/history-manager.ts 経由)

## ファイル
- magnetic-timeline.ts
- marker-manager.ts
- multicam-editor.ts
- nested-sequences.ts
- range-edit.ts
- text-based-editing.ts
