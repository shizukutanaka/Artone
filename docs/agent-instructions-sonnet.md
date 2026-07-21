# Sonnet セッション向け指示書 — Artone v3

対象: 定型化された検証可能タスク。アーキテクチャ判断やハードウェア検証を要するものは
[`agent-instructions-opus.md`](./agent-instructions-opus.md) に委譲する。
プロダクト評価は [`product-assessment-2026-07.md`](./product-assessment-2026-07.md)。

---

## 担当タスク (即実行可)

- **純TS バグ修正ループ** (下記テンプレート) — 本セッションの主戦力
- **テストカバレッジ拡充** (リスクゾーン 95%+ 目標)
- **i18n キー追加** — `i18n/` に en.json + ja.json を同時追加、階層キー (例 `timeline.clip.split`)
- **ドキュメント整備**

## バグ修正ループ (実績: 1周 ≈ 1修正、PR #15〜#21 で7連続成功)

1. **Explore エージェントで監査**。プロンプトに必ず含める要件:
   - 「**単一の最強・検証可能な発見のみ**」を要求
   - 「**wrong vs correct を明示計算**」させる
   - 「**見つからなければ正直に『なし』と報告**」を明記 (シャキッとしない発見の捏造防止)
   - **修正済み領域を列挙して除外** (`CHANGELOG.md` の `[Unreleased]` と過去エントリを参照)
   - GPU/WGSL・ハードウェア依存を明示的に対象外にする
2. **発見を鵜呑みにしない** — 自分でソースを読んで検証し、可能なら node で数値を実証する
3. 修正 → 回帰テスト → `git stash` regress-then-fix → 全スイート → lint → CHANGELOG
4. commit (規定 trailer 付き) → push → PR → squash merge → `git rebase --onto origin/main <旧base>`

## 検証バー (省略不可)

- 新テストは**修正前ソースで fail** すること (`git stash push <対象>` で確認)
- `npx vitest run` 全 **4,686+ 件緑** / `npx tsc --noEmit` クリーン
- `npx eslint <変更ファイル>` **0 errors**、警告はベースライン非悪化

## 触ってはいけない領域 (発見しても報告に留め、Opus/人間へ委譲)

- GPU/WGSL・WebCodecs ハードウェア呼び出し・canvas ピクセル読み出し (jsdom で検証不能)
- リアルタイム音声グラフ (AudioContext / AudioWorklet)
- 記憶ベースの色科学・信号処理定数 (spec の一次資料がない限り触らない)
- `recovery/` のデータ削除経路 (事前バックアップなしの変更禁止)
- P1〜P4 のようなアーキテクチャ級タスク (複数モジュール横断・設計判断を伴う)

## テスト規約

- **jsdom 環境**。vitest glob は `tests/**/*.test.ts` のみ (`.tsx` は収集されない)
- **React テスト**: `const h = React.createElement` + `createRoot`/`act` パターン。
  JSX と `@testing-library` は不使用 (glob が .test.ts のみのため)
- **決定論必須**: `Date.now` / `Math.random` 依存の検証は避けるか固定値を注入する
- **CLAUDE.md 遵守**: ハードコード文字列禁止 (`t('key')` 経由)、`any` 禁止、全関数 docstring、
  AI生成箇所は `# AI generated (reviewed)` を明示

## 環境の既知制約 (Opus 指示書と共通)

- tag push / `.github/workflows/` push は 403 → Release はユーザーに委ねる
- squash merge 後 CHANGELOG が衝突 → `rebase --onto origin/main` で解消
- committer email は noreply@anthropic.com を維持、branch tip は authored commit に保つ
- モデル識別子をコミット/PR/コード/コメントに入れない (chat 返信のみ)
