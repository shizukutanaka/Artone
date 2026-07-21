# Artone v3 — プロダクト評価 (長所・短所・改善案)

作成: 2026-07 / 対象バージョン: 3.1.0 / テスト規模: 4,686 件 (135 ファイル、全緑)

本書は、全25ディレクトリの体系的監査と PR #9〜#21 の検証済み修正を通じて得た知見に基づく
プロダクト評価である。改善案の詳細な出典付きリストは
[`docs/improvement-research-2026-07.md`](./improvement-research-2026-07.md) を、
将来セッションの実行手順は
[`docs/agent-instructions-opus.md`](./agent-instructions-opus.md) /
[`docs/agent-instructions-sonnet.md`](./agent-instructions-sonnet.md) を参照。

---

## 1. 長所 (実証データに基づく)

| 領域 | 根拠 |
|------|------|
| **純TS面の品質が高い** | 4,686 テスト全緑。並列監査を6回繰り返した結果、各回の発見は1件のみで「他は堅牢」と報告 — バグ密度は明確に低下している |
| **検証文化が定着** | 全修正が `git stash` regress-then-fix で検証済み (修正前ソースで新テストが fail することを確認)。CHANGELOG に修正機構と検証方法まで記録 |
| **ドキュメント完備** | 25/25 ディレクトリに CLAUDE.md。リスクゾーン・設計規約・テスト要求・禁止事項が明文化されている |
| **設計原則が一貫** | Web標準のみ (WebCodecs/WebGPU/WASM)、100%ローカル処理、サーバーレス、プラグインABI安定保証 — 「10年運用前提」がコードに反映 |
| **セキュリティ境界が実効的** | sandbox の Worker/iframe 遮断、CVE スキャナ (semver キャレット範囲まで正確)、SBOM CycloneDX 1.7 / SPDX 2.3 |
| **品質ゲートが多層** | カバレッジ 80%+ (リスクゾーン 95%+)、bench 退行検出 (mean/p95 二重判定)、WCAG AAA 監査、ライセンス互換性チェック |

## 2. 短所 (既知ギャップ — 全て確認済み)

1. **エクスポート未接続** — `app/main.ts` の `exportProject()` は
   「Export is not yet wired to the render pipeline」で明示的に throw する。
   編集はできても書き出せない (プロダクトとして最大の機能ギャップ)。
   なお silent data loss を避けるため意図的に fail-loud にしてある点は正しい設計。
2. **デマルチプレクサ不在** — `core/codec-router.ts` は FFmpeg WASM ルーティングを
   「決定」するが実体がなく、実 MP4/MOV/MKV をデコードできない。
3. **AI 依存が旧世代** — `@xenova/transformers ^2.17.2` (v2)。WebGPU 推論可能な
   後継 `@huggingface/transformers` v4 に未移行。
4. **GPU/WGSL 面が CI 検証不能** — レイヤ変換 (position/scale/rotation) 未実装。
   jsdom では GPU device 呼び出しに到達できず、正しさはハードウェア検証に依存するため
   自律セッションでは進められない。
5. **未配線モジュール** — interchange (OTIO/EDL/FCPXML)、collab (P2P は signaling が
   サーバーレス原則と衝突するため凍結判断済み)、plugin-bridge の VST/AU、
   scopes への実フレーム供給。
6. **リリース自動化の権限制約** — 現行の実行環境から git tag push と
   `.github/workflows/` push が 403 になる。GitHub Release オブジェクトの作成は
   ユーザー操作か workflow の手動実行を要する。

## 3. 改善案 (優先度順)

出典と工数の詳細は `improvement-research-2026-07.md` の P1〜P10 を正とする。
本書ではそれを「担当モデルの割り当て」の観点で再整理する。

| 優先 | 内容 | 担当 | 工数 | 前提判断 |
|------|------|------|------|---------|
| P1 | デマルチプレクサ導入 (mp4box.js / mediabunny / ffmpeg.wasm 比較決定) | **Opus** | L | ライブラリ選定 (人間承認推奨) |
| P2 | エクスポートパイプライン配線 (timeline → render → encode → mux) | **Opus** | L | P1 完了後が効率的 |
| P3 | Transformers.js v2 → v4 移行 (WebGPU 推論) | **Opus** | M | API 互換性検証 |
| P4 | WebGPU レイヤ変換の実装 | **Opus + 人間** | M | 座標系規約の決定 + ハードウェア検証 |
| P5 | 自動字幕の実モデル接続 (P3 依存) | **Opus** | M | P3 完了後 |
| P6〜P7 | AgX トーンマッピング追加 / WebGPU 新機能の限定活用 | **Opus** (GPU/color) | S | spec 一次資料 + ハードウェア検証 |
| P8 | 未配線モジュールの活殺判断 | **人間 + Opus** | 判断 | アーキテクチャ方針 |
| P9〜P10 | OPFS 評価 / 研究論文ウォッチ | **Sonnet** (調査) | S | なし |
| 継続 | 純TS修正ループ・テスト拡充・i18n 拡張 | **Sonnet** | S×n | なし (即実行可) |

## 4. 総括

Artone v3 は、**検証可能な純TS面ではプロ級の完成度**に達している一方、
**「実ファイルを開いて書き出す」という編集ソフトの根幹がまだ未接続**という
明確な二極構造を持つ。したがって次の重点は品質改善ではなく機能完成 (P1→P2) にあり、
これはアーキテクチャ判断とハードウェア検証を伴うため Opus 級のセッションが担うべきである。
定型化された品質維持ループ (バグ修正・テスト・i18n) は Sonnet 級が継続すればよい。
