# Artone v3

> ブラウザ完結のプロ動画エディタ — 100% ローカル、サーバーレス、オフライン対応

[![Version](https://img.shields.io/badge/Version-3.1.0-00C4CC)](./CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-4850%20passing-5bb974)](./tests)
[![PWA](https://img.shields.io/badge/PWA-Ready-5bb974)](https://web.dev/progressive-web-apps/)

DaVinci Resolve / Premiere Pro / Final Cut Pro 級の編集をブラウザだけで実現。インストール不要。データはすべてローカル。プライバシーは完全にあなたのもの。

## 特長

| カテゴリ | 機能 |
|---|---|
| コア | WebCodecs H.264/H.265/VP9/AV1、WebGPU 60fps プレビュー |
| 編集 | マグネティックタイムライン、マルチカム、ネストシーケンス |
| カラー | DaVinci 級カラーグレーディング、HDR10/HLG、LUT |
| オーディオ | Fairlight 級ミキサー、EQ/コンプレッサー、ノイズ低減 |
| AI | ローカル AI (Transformers.js、100% オンデバイス推論)、自動字幕 |
| 互換 | OTIO 1.0、EDL、FCPXML — DaVinci/Premiere/FCP 往復編集 |
| セキュリティ | SBOM (CycloneDX/SPDX)、CVE スキャン、OSV 連携 |
| アクセシビリティ | WCAG 2.2 AAA、11 言語対応 (日本語/英語/中国語/韓国語他) |

## デスクトップ版 (正規の配布形態)

Artone の正規の配布形態はデスクトップアプリ (ソフトウェア) です。`desktop/` の最小の Electron 殻が、Web 版と同一のビルド (`dist/`) を無改変のまま読み込みます。ブラウザ版は開発・試用向けです。

| OS | 形式 |
|---|---|
| Windows | portable `.exe` (インストール不要) |
| macOS | `.zip` (展開して `Artone.app` を起動) |
| Linux | `.AppImage` (`chmod +x` して起動) |

**未署名のため、初回起動時に OS の警告が出ることがあります。**

- Windows: SmartScreen の「Windows によって PC が保護されました」→「詳細情報」→「実行」
- macOS: Gatekeeper の「開発元を確認できません」→ Finder で右クリック →「開く」(またはシステム設定 → プライバシーとセキュリティ →「このまま開く」)

ソースからのビルド:

    npm ci && npm run build      # dist/ を生成
    cd desktop && npm ci
    npm start                    # 起動確認
    npm run dist:win             # または dist:mac / dist:linux → desktop/release/

殻は contextIsolation 有効 / nodeIntegration 無効 / sandbox 有効 / preload なし。新規ウィンドウは拒否 (http/https は既定ブラウザで開く)、アプリ外へのナビゲーションは遮断、多重起動は既存ウィンドウを前面に出す。`app://artone/` から COOP/COEP 付きで配信するため SharedArrayBuffer が使えます (Service Worker はこのスキームでは登録されず、オフライン動作はローカルファイルで担保)。

## クイックスタート

    git clone https://github.com/shizukutanaka/artone
    cd artone
    npm install
    npm run dev

http://localhost:5173 をブラウザで開く。

## 開発コマンド

    npm run dev           # 開発サーバー (HMR)
    npm run build         # プロダクションビルド
    npm run typecheck     # TypeScript 型チェック
    npm run lint:design   # デザインシステム整合性 (10項目)
    npm test              # Vitest 単体・統合
    npm run bench         # パフォーマンス退行検出
    npm run sbom          # SBOM 生成
    npm run sbom:online   # OSV CVE スキャン

## アーキテクチャ

依存の方向: app/ → 各モジュール (単方向、循環依存ゼロ、25ディレクトリ全CLAUDE.md)

| モジュール | 行数 | 役割 |
|---|---|---|
| app/ | 5,300 | React UI、デザインシステム、エントリポイント |
| timeline/ | 2,985 | マグネティックタイムライン、マルチカム |
| color/ | 1,639 | カラーグレーディング、HDR、LUT |
| plugins/ | 1,470 | VST/AU WASM プラグインホスト |
| animation/ | 1,312 | キーフレーム、モーショングラフィックス |
| security/ | 1,181 | SBOM、サプライチェーン監査 |

## CI 品質保証 (10項目 ALL PASS)

    [1/10] Hardcoded colors         PASS
    [2/10] Duplicate theme constants PASS
    [3/10] Design token compliance  PASS
    [4/10] Orphan source files      PASS
    [5/10] Test file placement      PASS
    [6/10] Dead code detection      PASS
    [7/10] CLAUDE.md coverage       PASS
    [8/10] Raw localStorage         PASS
    [9/10] console.log (production) PASS
    [10/10] TypeScript syntax check PASS

## 動作要件

- 必須: Chrome 113+ / Edge 113+ / Safari 17+
- 推奨: WebGPU 対応 GPU
- メモリ: 8GB+ (4K 編集は 16GB 推奨)

WebGPU 非対応環境は Canvas 2D レンダリングに自動フォールバック (起動時の capability 検出で full / degraded / minimal を判定)。

## デプロイ

    wrangler deploy   # Cloudflare Pages
    vercel deploy     # Vercel

必須 HTTP ヘッダー: Cross-Origin-Opener-Policy: same-origin / Cross-Origin-Embedder-Policy: require-corp

## 設計原則

- Carmack: 計測根拠ある最適化。ゼロコピー GPU。60fps 優先。
- Martin: 単一責任。Command Pattern。Clean Architecture。
- Pike: シンプル優先。明確さ > 巧妙さ。1モジュール1目的。
- Apple: 段階的開示。1000のNo。デザインシステム。

詳細は CLAUDE.md と docs/APPLE_PRINCIPLES.md 参照。

## ライセンス

MIT (c) 2026 Artone Contributors
