# Artone v3

> ブラウザ完結のプロ動画エディタ — 100% ローカル、サーバーレス、オフライン対応

[![Version](https://img.shields.io/badge/Version-3.1.0-00C4CC)](./CHANGELOG.md)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-4670%20passing-5bb974)](./tests)
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
    npm run lint:design   # デザインシステム整合性 (9項目)
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

## CI 品質保証 (9項目 ALL PASS)

    [1/9] Hardcoded colors         PASS
    [2/9] Duplicate theme constants PASS
    [3/9] Design token compliance  PASS
    [4/9] Orphan source files      PASS
    [5/9] Test file placement      PASS
    [6/9] Dead code detection      PASS
    [7/9] CLAUDE.md coverage       PASS
    [8/9] Raw localStorage         PASS
    [9/9] console.log (production) PASS

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
