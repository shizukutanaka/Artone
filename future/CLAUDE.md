# future/ — 未接続モジュール隔離

## Why
Apple: "Say No to 1000 things"

これらのモジュールは実装済みだが、どこからも import されていない。
バンドルに含まれず、テストも走らない。保守コストだけが発生する。

削除ではなく隔離: 将来 Pro tier で有効化する際の出発点として保持。

## 隔離理由 (2026-05)
- `cloud/cloud-renderer.ts` (1,030行) — 分散レンダリング。WebRTC Worker Pool。まだ需要不明
- `streaming/live-streamer.ts` (1,138行) — ライブ配信 (YouTube/Twitch)。競合多数
- `mobile/native-bridge.ts` (918行) — Capacitor iOS/Android。PWA 先行で十分
- `batch/batch-processor.ts` (579行) — バッチ処理。CLI 版検討中

## 復活条件
1. Pro tier で有効化する設計判断が合意される
2. `app/main.ts` から import する
3. ユニットテストを `tests/` に追加する
4. CI で動作確認する
5. この CLAUDE.md を更新する

## 復活禁止条件
- 「とりあえず入れておく」は不可。使用率データで判断する
- Essential / Standard tier に昇格させない (段階的開示の原則)
