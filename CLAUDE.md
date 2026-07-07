# Artone v3

## WHY
ブラウザ完結のプロ動画エディタ。100%ローカルAI。サーバーレス。インストール不要。
DaVinci/Premiere/FCP級の編集をWeb標準（WebCodecs/WebGPU/WebAssembly）で実現。

10年運用前提:
- Web標準のみ依存。プロプライエタリAPIゼロ。
- ローカル処理完結。データ主権ユーザー側。
- プラグインABIは安定保証。VST/AU WASMブリッジで永続互換。

## MAP

```
├── core/          WebCodecs パイプライン (デコード/エンコード基盤)
├── render/        WebGPU レンダリング (60fps プレビュー)
├── timeline/      マグネティックタイムライン / マルチカム / ネスト / マーカー
├── color/         カラーグレーディング / HDR / LUT
├── audio/         オーディオエンジン / サラウンド / VST/AUブリッジ
├── ai/            AI処理 (ローカル Transformers.js / WebGPU推論)
├── export/        エクスポート (8プリセット)
├── animation/     キーフレーム / モーショングラフィックス
├── captions/      キャプション / 字幕
├── collab/        Yjs協調編集
├── plugins/       プラグインホスト + WASMブリッジ
├── undo/          履歴管理 (Command Pattern / ブランチ)
├── scopes/        Waveform / Vectorscope / Histogram
├── perf/          パフォーマンスモニタ / 自動品質調整
├── recovery/      クラッシュリカバリ / 自動バックアップ
├── media/         メディアブラウザ / プロキシ生成
├── project/       プロジェクト永続化
├── interchange/   OTIO / EDL / FCPXML 互換層 (10年互換)
├── bench/         パフォーマンス退行検出 (CI gate)
├── accessibility/ WCAG 2.1 AAA 監査
├── security/      SBOM + サプライチェーン監査
├── i18n/          国際化 (EN/JP + 1000言語目標)
├── install/       OS自動判定インストーラ
├── app/           統合UI (React) / デザインシステム / エントリポイント
├── scripts/       CI チェックスクリプト
├── tests/         Vitest 単体 + Playwright E2E
└── future/        未接続モジュール隔離 (現状: 空。詳細は future/CLAUDE.md)
```

全ディレクトリに CLAUDE.md あり (25/25)。

リスクゾーン:
- `recovery/` データ損失リスク
- `audio/` リアルタイム制約 (GC 禁止)
- `render/` GPU リソース管理 (destroy 漏れ)
- `plugins/` セキュリティ境界 (サンドボックス)
- `interchange/` 業界標準互換 (10年生存性)
- `app/design-system.ts` 変更は全 UI に波及

## RULES

### 設計
- Carmack: 計測なくして最適化なし。ゼロコピーGPU優先。データ指向。
- Martin: 単一責任。依存逆転。Command Pattern で履歴可能化。
- Pike: シンプル優先。明確さ > 巧妙さ。早期リターン。

### コード
- 新ファイル作成前に類似機能の既存ファイル確認
- 重複ファイルは統合・削除・修正
- 関数引数3以下。ネストはガード節で回避
- 全関数 docstring/JSDoc 必須
- 型注釈必須。`any` は禁止 (例外時はコメント明記)
- `# AI generated (reviewed)` で AI生成箇所を明示

### セキュリティ
- 入力バリデーション全入口で実施
- HTTPS/TLS 強制
- パスワード bcrypt/Argon2
- API キー / シークレット は環境変数
- WASM プラグインはサンドボックス内のみ

### i18n
- 日本語ベース。英語サブ。1000言語対応前提で keys 設計
- ハードコード文字列禁止。`t('key')` 経由のみ
- 文字列ID は階層構造 (例: `timeline.clip.split`)

### コミット
- semantic versioning (v1.0.0)
- conventional commits (`fix:`, `feat:`, `refactor:`)
- CHANGELOG.md 必須

### テスト
- カバレッジ 80%+
- 単体 + 統合 + E2E + 負荷
- リスクゾーン (recovery/audio/plugins) は 95%+
- render は単体 90%+ (GPU device 呼び出し面は jsdom で到達不能。WebGPU/WebGL の正しさは render/CLAUDE.md 規定のハードウェア検証 + リークテストで担保)

## WORKFLOWS

### 機能追加
1. 要件定義 (plan mode)
2. 既存類似機能の確認
3. 基本設計 → 詳細設計
4. 実装 (既存パターン踏襲)
5. テスト追加 (単体 + 統合)
6. ドキュメント更新
7. レビュー → リリース

### バグ修正
1. 再現テスト作成 (failing)
2. 原因特定 (binary search)
3. 修正 → テスト pass
4. リグレッションテスト追加
5. CHANGELOG 記載

### リファクタ
1. 全テスト pass 確認
2. 1関数ずつ変更 + テスト
3. 動作変更ゼロを保証
4. コミット粒度を小さく

### リリース
1. `npm test` 全 pass
2. Linter 警告ゼロ
3. `npm audit` 脆弱性ゼロ
4. `npm run bench` 退行ゼロ (critical)
5. `npm run sbom` SBOM 生成
6. `npm run test:a11y` WCAG AAA pass
7. CHANGELOG 更新
8. tag → GitHub Release
9. Cloudflare Pages 自動デプロイ

### 品質ゲート (CI)
- 全テスト pass (単体 + 統合 + E2E)
- カバレッジ 80%+ (リスクゾーン 95%+。render は単体 90%+ / GPU 面はハードウェア検証)
- パフォーマンス退行 critical なし
- WCAG AAA critical issues なし
- CVE critical/high なし
- ライセンス互換性 OK

## 禁止事項
- 量子・占星術・非現実機能の実装
- `console.log` をプロダクションコードに残す
- 同種ソフトの商標・名称を製品名/モジュール名に使う
- 存在しない URL/メールアドレスをコード/ドキュメントに記載
- データ損失を引き起こす可能性のある変更を recovery/ で行う際の事前バックアップ無し
