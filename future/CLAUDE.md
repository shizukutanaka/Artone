# future/ — 未接続モジュール隔離 (現状: 空)

## Why
Apple: "Say No to 1000 things"

## 現状 (2026-07 検証)
このディレクトリには本 CLAUDE.md 以外のファイルは存在しない。
以前ここに隔離されていた `cloud/cloud-renderer.ts`・`streaming/live-streamer.ts`・
`mobile/native-bridge.ts`・`batch/batch-processor.ts` は、いずれかの時点で
削除済み(理由・コミットは未特定)。このファイルはその事実を反映せず
「実装済みで隔離中」と誤って主張し続けていた — コードを削除したら
ドキュメントも同時に更新するルールを徹底する。

`vite.config.ts` にはこれらを指す `@cloud`/`@streaming`/`@mobile` エイリアスは
現在存在しない(既に整理済み)。

## このディレクトリの役割
「実装はしたが、まだ本体に組み込まない」機能の隔離場所、という運用ルールは
維持する。

## 隔離するかどうかの判断基準
- Essential / Standard tier に安易に昇格させない (段階的開示の原則)
- 「とりあえず入れておく」は不可。実データ・要望に基づいて判断する
- 復活させる場合は: (1) tier 昇格の設計合意 → (2) `app/main.ts` から import →
  (3) `tests/` にユニットテスト追加 → (4) CI 確認 → (5) この CLAUDE.md 更新

## 過去に検討され、現在コードが存在しない機能 (参考)
- 分散レンダリング (WebRTC Worker Pool) — 需要不明のまま保留
- ライブ配信 (YouTube/Twitch) — 競合多数
- ネイティブブリッジ (Capacitor iOS/Android) — PWA 先行で十分と判断
- バッチ処理 (CLI 版) — 検討中
