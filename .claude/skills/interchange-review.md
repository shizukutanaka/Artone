# Interchange Format Review Skill

## 起動条件
- OTIO/EDL/FCPXML 関連変更
- 新フォーマット追加
- 既存 NLE との互換性検証

## 手順

### 1. 仕様準拠確認
- OTIO: SchemaDef-1 厳守
- EDL: CMX 3600 (SMPTE 207M)
- FCPXML: Apple 公式 schema (1.10+)
- SMPTE タイムコード: 12M-1, 12M-2

### 2. ラウンドトリップテスト
Artone → OTIO → Artone で:
- クリップ数一致
- 持続フレーム数一致
- 効果パラメータ一致
- マーカー保持

### 3. 他 NLE 検証
- DaVinci Resolve で読み込めるか
- Premiere Pro で読み込めるか
- Final Cut Pro X で読み込めるか
- Avid Media Composer で読み込めるか

### 4. エッジケース
- 空タイムライン
- 単一クリップ
- 重複クリップ
- ネスト/マルチカム
- ドロップフレーム TC (29.97/59.94)
- 24h 跨ぎ TC

## チェックリスト

- [ ] OTIO Validator pass
- [ ] EDL FCM 行正しい (DROP/NON-DROP)
- [ ] FCPXML schema validation pass
- [ ] DaVinci Resolve 読み込み確認
- [ ] ラウンドトリップでデータ損失ゼロ
- [ ] エッジケーステスト追加

## 不変
- 独自拡張は metadata.artone に閉じ込める
- 後方互換: 古いスキーマも読み込み可能
- 仕様変更は metadata でバージョニング
