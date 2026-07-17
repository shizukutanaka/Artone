# collab/ — Figma 風リアルタイム協調編集 (未実装)

## 現状 (2026-07 検証)
`collaboration-engine.ts` は CollabUser/Comment/Annotation の型定義と
ローカルなインメモリ状態管理のみ。`yjs`/`y-webrtc`(package.json の依存関係
には存在)への import は一行も無く、CRDT 同期・WebRTC P2P・複数人での
リアルタイム編集は実際には動作しない。

「実装済みで Pro tier 限定表示」という以前の記述は誤り — 表示以前に
同期機構そのものが存在しない。

## サーバーレス原則との根本的緊張 (2026-07 リサーチ結論)
外部調査 (docs/improvement-research-2026-07.md の P8) により、この未配線は
「バグ」ではなく設計上の未解決課題であることが確定した:

- `y-webrtc` は最新版 v10.3.0 (2023-12) のまま — Artone は既に最新版に依存。
  「バージョン遅れ」ではない。
- **P2P であってもシグナリングサーバは原理的に必須** (WebRTC の ICE/SDP
  ハンドシェイクにはランデブーチャネルが要る)。実運用の「serverless Yjs」は
  全て FaaS 依存 (例: AWS Lambda シグナリング)。root CLAUDE.md の
  「サーバーレス・外部依存ゼロ」原則と直接衝突する。
- 真のゼロインフラ P2P は (a) 手動 SDP コピペ交換 (UX 劣悪) か
  (b) DHT ベースのピア発見 (Peersuite 型、ただし公開ブートストラップノード
  に依存) のみ。いずれもホビー水準で、production の CRDT エディタでの
  前例は無い。
- 出典: https://github.com/yjs/y-webrtc /
  https://medium.com/collaborne-engineering/serverless-yjs-72d0a84326a2

## 判断 (2026-07): 凍結
サーバーレス原則を維持する限り、フル機能のリアルタイム協調編集は実装しない。
配線する場合は上記 (a) 手動 SDP 交換のニッチモードに限定するか、
root CLAUDE.md のサーバーレス原則自体の見直し (人間判断) が前提。
現状の未配線を「未完成バグ」として扱わないこと。

## 実装する場合の設計方針 (凍結中・参考)
- CRDT ベース (Yjs) — シグナリング手段の確保が前提 (上記の緊張を解決してから)
- 同期衝突の解消が複雑
- ネットワーク断時の fallback、オフライン時はローカル操作を蓄積

## 段階的開示との関係
「Pro tier のみ表示」は課金ゲートではなく `app/design-system.ts` の
`FeatureTier`(ユーザーが選ぶ経験レベルに基づく UI 複雑度の段階的開示)。
実装が完了した場合もこの意味で運用する。

## ファイル
- collaboration-engine.ts
