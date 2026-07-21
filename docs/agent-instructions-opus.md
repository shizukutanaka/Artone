# Opus セッション向け指示書 — Artone v3

対象: アーキテクチャ級・複数モジュール横断・設計判断を要するタスク。
定型化された検証済み修正ループは [`agent-instructions-sonnet.md`](./agent-instructions-sonnet.md) を参照。
プロダクト全体の評価は [`product-assessment-2026-07.md`](./product-assessment-2026-07.md)、
改善案の出典は [`improvement-research-2026-07.md`](./improvement-research-2026-07.md)。

---

## 担当タスク (優先順)

1. **P1: デマルチプレクサ導入** — mp4box.js / mediabunny / ffmpeg.wasm v0.12+ を
   バンドルサイズ・ライセンス・メンテ状況・WebCodecs 連携性で比較し、
   **選定理由を docs に残してから**実装する。`core/codec-router.ts` が前提とする
   FFmpeg WASM の実体不在を解消するのが目的。
2. **P2: エクスポート配線** — `render/` の合成結果を `core/` の VideoEncoder →
   `export/mp4-muxer.ts` (実装済・検証済) へ接続。`app/main.ts` の `exportProject()` は
   現在 "Export is not yet wired to the render pipeline" で明示 throw している。
   その throw を実配線に置換する。silent data loss を避ける fail-loud の設計思想は維持。
3. **P3: AI 依存更新** — `@xenova/transformers ^2.17.2` → `@huggingface/transformers` v4
   (WebGPU 推論)。API 互換性を検証しながら移行。
4. **P4: WebGPU レイヤ変換** — position/scale/rotation。**座標系規約を決定・文書化してから**
   実装する。GPU の正しさは `render/CLAUDE.md` のハードウェア検証プロトコルに従う。

## 確立済みワークフロー (全変更で厳守)

本セッションの PR #15〜#21 で7連続成功した手順。1修正ずつ小さく回す:

1. `npx tsc --noEmit` — クリーン確認
2. 回帰テスト作成 — 修正対象の **wrong vs correct を明示** (可能なら node で数値実証)
3. `git stash push <対象ファイル>` → テストが**修正前ソースで fail** することを確認 → `git stash pop`
4. `npx vitest run` — 全スイート緑 (現在 **4,686 件**)
5. `npx eslint <変更ファイル>` — 0 errors、警告はベースライン非悪化 (複雑度が上がるなら
   ヘルパ抽出で相殺)
6. `CHANGELOG.md` の `[Unreleased]` に詳細エントリ (バグ機構・修正・検証方法・テスト数変化)
7. conventional commit + 規定 trailer → push → PR → squash merge

## 環境の既知制約 (ハマりポイント)

- **tag push / `.github/workflows/` push は 403** (git proxy)。GitHub Release オブジェクトの
  作成はこの環境では不可 — ユーザー操作か workflow 手動実行に委ねる。テンプレは
  `docs/release-workflow.yml` にある。
- **squash merge 後は CHANGELOG が毎回衝突する**。main の squash コミットは自分の
  authored commit と別ハッシュになるため、`git rebase --onto origin/main <旧base>` で
  新規コミットのみを main 上に載せ替えてから force-with-lease push する。
- **vitest glob は `tests/**/*.test.ts` のみ** (.tsx 不可)。React テストは
  `React.createElement` + `createRoot`/`act` パターン (@testing-library 不使用)。
- **committer email は noreply@anthropic.com を維持** (Stop フックが Unverified を検出する)。
  ローカルの branch tip は自分の authored commit に保つ (main の GitHub squash commit を
  tip にしない)。
- **モデル識別子をコミット/PR/コード/コメントに入れない** (chat 返信のみ)。

## リスクゾーン規則 (root CLAUDE.md 準拠)

- `recovery/`: データ損失可能性のある変更は**事前バックアップ必須**。
- `color/`: 定数は一次資料 (Academy S-20xx / ITU-R spec) を必須とする。
  **記憶からの定数記述は禁止** (本セッションで ACEScc 黒点の定数バグを spec 照合で修正した経緯あり)。
- `render/` GPU 面: jsdom で検証不能。`render/CLAUDE.md` のハードウェア検証 + リークテストで担保。
- `audio/`: リアルタイム制約 (GC 禁止)。`plugins/`: sandbox 境界を緩める変更禁止。
- `interchange/`: 業界標準互換 (10年生存性)。フィールド往復ロスに注意。
