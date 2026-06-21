# interchange/ — 業界標準フォーマット互換層

## Why
10年運用のため、他 NLE (DaVinci/Premiere/FCP/Avid) と往復編集可能。
ロックインを防ぐ。プロジェクトファイルは10年読めなければならない。

## ルール
- 既存の OTIO/EDL/FCPXML 仕様を厳守。独自拡張は metadata に閉じ込める
- 後方互換: 古い OTIO スキーマも import 可能に保つ
- メタデータの artone 名前空間で内部情報を保持
- フレームレート差は変換層で吸収 (round)
- 検証は OTIOValidator で行う

## ファイル
- `otio.ts` - OpenTimelineIO 1.0 import/export
- `legacy-formats.ts` - EDL, FCPXML, タイムコード変換

## 仕様参照
- OTIO: https://opentimelineio.readthedocs.io/
- EDL CMX 3600: SMPTE 207M
- FCPXML 1.10: Apple Developer Documentation
- SMPTE タイムコード: SMPTE 12M
