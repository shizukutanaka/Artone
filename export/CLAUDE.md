# export/ — エクスポートエンジン (8 プリセット)

## リスク
- ユーザーの作品を出力する最終段。データ損失は致命的

## ルール
- プリセット変更時は E2E テスト必須\n- コーデック設定は WebCodecs の capability check を先に行う

## ファイル
- export-engine.ts
