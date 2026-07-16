# collab/ — Figma 風リアルタイム協調編集 (未実装)

## 現状 (2026-07 検証)
`collaboration-engine.ts` は CollabUser/Comment/Annotation の型定義と
ローカルなインメモリ状態管理のみ。`yjs`/`y-webrtc`(package.json の依存関係
には存在)への import は一行も無く、CRDT 同期・WebRTC P2P・複数人での
リアルタイム編集は実際には動作しない。

「実装済みで Pro tier 限定表示」という以前の記述は誤り — 表示以前に
同期機構そのものが存在しない。

## 実装する場合の設計方針 (未着手)
- CRDT ベース (Yjs) — `y-webrtc` または自前シグナリングサーバーが必要
  (現状はシグナリングサーバーが無い。サーバーレス原則との整合を要検討)
- 同期衝突の解消が複雑
- ネットワーク断時の fallback、オフライン時はローカル操作を蓄積

## 段階的開示との関係
「Pro tier のみ表示」は課金ゲートではなく `app/design-system.ts` の
`FeatureTier`(ユーザーが選ぶ経験レベルに基づく UI 複雑度の段階的開示)。
実装が完了した場合もこの意味で運用する。

## ファイル
- collaboration-engine.ts
