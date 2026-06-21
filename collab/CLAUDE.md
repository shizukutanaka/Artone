# collab/ — Figma 風リアルタイム協調編集 (Yjs)

## リスク
- 同期衝突の解消が複雑\n- ネットワーク断時の fallback

## ルール
- CRDT ベース (Yjs)\n- Pro tier のみ表示\n- オフライン時はローカル操作を蓄積

## ファイル
- collaboration-engine.ts
