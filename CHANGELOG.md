# Changelog

Artone v3 の全変更を記録。

[Keep a Changelog](https://keepachangelog.com/) 形式。
[Semantic Versioning](https://semver.org/) 準拠。

## [Unreleased]

### Changed
- **リブランド: NovaEdit → Artone**。製品名・識別子・ストレージ/キャッシュキー・リポジトリ参照を全面改名 (`NovaEdit*`→`Artone*`、`novaedit`→`artone`、`NovaTimeline/NovaClip/...`→`Artone*`)。サードパーティ依存 `@xenova/transformers` は対象外として保護。
- 存在しない URL を実在の参照へ修正 (`novaedit.app` → `github.com/shizukutanaka/artone`)。
- `package.json` の不正な peer 依存を解消 (`eslint-plugin-react-hooks` 4 → 5、ESLint 9 flat config 対応)。
- `prepare` フックを husky v9 形式 + CI 安全ガード (`husky || true`) に変更。

### Fixed
- **コンパイル不能だった全ソースをビルド可能化** (`tsc --noEmit` エラー 206 → 0)。
  - JSDoc コメント内に紛れ込んでいた `import`/`const` 文を 4 ファイルで修正 (recovery-manager / lut-manager / sw-manager / proxy-workflow)。
  - `undo/history-manager.ts`: 未 import の `color`、未定義 `dsColor` を design-system 由来 `color` に統一。
  - strict-null / 未使用宣言 / プロパティ不整合などを behavior-preserving に解消 (`any`・`@ts-ignore` 不使用)。
- **本番ビルドの修復** (`npm run build`): 欠落していた `babel-plugin-transform-remove-console` を追加、型のみパッケージ `@webgpu/types` を manualChunks から除外、空ベンダーチャンクと非推奨 `splitVendorChunkPlugin` を整理。
- **テストスイートを全 green 化** (455/480 → 480/480)。実バグ修正を含む:
  - `timeline/magnetic-timeline.ts`: `splitClip` の 2 番目クリップ尺が 0 になる不具合、`moveClip` が自クリップを再リップルする不具合を修正。
  - `audio/audio-engine.ts`: 公開 `AudioTrack` オブジェクトに volume/pan/mute/effects の変更が反映されない不具合を修正、同期初期化 `ensureContext()` を追加。
  - `render/frame-cache.ts`: バイト上限による退避が hot 層に効かず `maxBytes` が無効化されていた不具合を修正。

### Removed
- 重複/オーファンファイルを削除: `project/plugin-bridge.ts` (plugins/ と同一)、ルート `ci.yml` (bench/security/a11y ジョブを `.github/workflows/ci.yml` へ統合後)、ルート `design-system-check.sh` (scripts/ が正本)、存在しない `future/{cloud,streaming,mobile}` への dead な vite エイリアス。
- 旧 v1 プロトタイプ (単一 HTML エディタ + Electron ラッパー) を v3 コードベースへ全面置換。

### Added
- 欠落アセットを補完: Artone ブランドの `favicon.svg`、`accessibility/bundle-entry.ts` (`build:a11y` 用エントリ)。
- **`captions/readability.ts`** — EBU/Netflix/YouTube/BBC 準拠キャプション正規化。放送規格 CPS 制限・行長制限・最小時間を実装。`normalizeCues()` / `auditCues()` を `CaptionManager.importFromTranscription()` に統合。26 テスト。
- **`color/lut-apply.ts`** — 純関数 3D-LUT 三線形補間 (ICC.1:2022/.cube 仕様準拠)。Fritsch-Carlson 単調三次スプライン曲線。`parseCubeLUT()` で .cube ファイルをパース。`grading-engine.ts` の CPU パスに統合。33 テスト。
- **`audio/biquad-filter.ts`** — Audio EQ Cookbook (Bristow-Johnson 2005) 準拠バイクアッドフィルタ。LPF/HPF/Peak EQ/LowShelf/HighShelf/Notch/Bandpass を実装。転置直接形 II で数値安定性を確保。`applyParametricEQ()` で複数バンド処理。26 テスト。
- **`color/color-science.ts`** — ACES カラーサイエンス純関数ライブラリ。AP0/AP1/sRGB/Rec.2020 相互変換行列、sRGB OETF/EOTF、ACEScc/ACEScct 対数符号化、Hill 2017 多項式 RRT+ODT。40 テスト。
- **`audio/dynamics.ts`** — Giannoulis 2012 設計コンプレッサー/リミッター/ゲート。ソフトニー対応、マルチチャンネル対応、ゲインリダクション曲線出力。`gainComputeCompressor()` のみ純粋関数で単体テスト可能。27 テスト。
- **`animation/keyframe-animator.ts`** に `bezierHandles` オプション引数を追加 (`addKeyframe()` の第6引数)。
- **`tests/keyframe-animator.test.ts`** — 22 種イージングの境界値・単調性・ベジェ・CRUD・エッジケースを網羅する 59 テスト。
- **`color/false-color.ts`** — False color 露出モニタリング。ARRI Alexa / RED / Simple の 3 プリセット + カスタム停留点対応。線形輝度 → sRGB カラーへの補間マッピング。`applyToBuffer()` で sRGB RGBA バッファを in-place false color 化 (α チャンネル保持)。30 テスト。
- **`export/export-queue.ts`** — バックグラウンド書き出しキュー。優先度キュー (high/normal/low)、最大並列数制御 (concurrency)、指数バックオフリトライ、キャンセル (個別/全体)、pause/resume、drain() 待機、onStatusChange 購読を実装。JobExecutor&lt;T&gt; で型安全なジョブ管理。29 テスト。
- **`render/tone-mapping.ts`** — CPU 側トーンマッピング演算子コレクション。Reinhard 2002 (シンプル/拡張)、Hable 2010 "Uncharted 2" フィルミック、Narkowicz 2015 ACES 近似、Uchimura 2017 "Gran Turismo" の 5 演算子 + Linear。`createToneMapper(algo, opts)` ファクトリで露出・ホワイトポイント・出力エンコーディング (sRGB / Linear / ガンマ) を制御。`applyToFloatBuffer` / `applyToUint8Buffer` でバッファ一括変換。57 テスト。
- **`interchange/otio.ts`** — OTIO `LinearTimeWarp.1` 対応 (エクスポート/インポート)。`ArtoneClip.speedFactor` をクリップ速度として保持し、OTIO 往復で完全ラウンドトリップ。`OTIOImporter.importWithReport()` メソッドで損失箇所を明示 (`OTIOImportLoss` / `OTIOImportResult`)。外部 NLE エフェクト・`MissingReference.1` メディアを損失リストに記録。18 テスト追加 (合計 36 テスト)。
- **`color/aces-idt-odt.ts`** — ACES IDT/ODT 完全実装 (OCIO 準拠)。カメラ IDT: Rec.709/sRGB、Sony S-Log3/S-Gamut3 (MLUT-001 v2.5)、ARRI LogC3 EI800/Wide Gamut。ディスプレイ ODT: sRGB SDR (Hill 2017 RRT+ODT)、DCI-P3 D65、HDR10 (Rec.2020+PQ, ST 2084)、HLG (ARIB STD-B67)。`primaryToXYZMatrix()` / `mat3Inv()` / `colorTransform()` / `applyColorTransformToBuffer()` を含む。69 テスト。
- **`render/spatial-resampler.ts`** — 高品質フレームリサイズ。Nearest-Neighbour / Bilinear / Keys Bicubic (a=−0.5) / Lanczos-3 (sinc窓) の4カーネル。プロキシ生成・エクスポートスケーリング・サムネイル生成に対応。RGBA Uint8ClampedArray in/out、アルファチャンネル正確補間。34 テスト。
- **`media/waveform-generator.ts`** — タイムライン表示用オーディオ波形データ生成。単/多チャンネル対応 `computeWaveform()` / `computeWaveformMultichannel()`。ビン単位の min/max/RMS 統計。`normalizeWaveform()` でピーク正規化。`downsampleWaveform()` でズームアウト表示対応。28 テスト。
- **`audio/pitch-detection.ts`** — YIN アルゴリズムによる基本周波数推定 (de Cheveigné & Kawahara 2002)。差分関数・CMNDF・絶対閾値探索・放物線補間の4ステップを完全実装。440 Hz ±3 Hz 精度。`detectPitch()` 単発解析、`createPitchDetector()` ストリーミング対応。清明度 (clarity) スコアで信頼性を定量化。33 テスト。
- **`color/delta-e.ts`** — CIE 色差メトリクス完全実装。XYZ↔L*a*b*変換 (D65/D50参照光源)、sRGB(線形/バイト)→L*a*b*、L*a*b*↔L*C*h*。CIE76 (Euclidean)、CIE94 (クロマ/色相重み付き、グラフィックアーツ/テキスタイル両パラメタ)、CIEDE2000 (最高精度、Sharma 2005 全テストベクタ検証済み)。38 テスト。
- **`color/cie-chromaticity.ts`** — CIE 1931 xy 色度座標ライブラリ。XYZ→xy変換、sRGB(線形/バイト)→xy変換、標準光源 (D50/D55/D65/D75/A/DCI/D60/E)、色域プライマリ三角形 (sRGB/Rec.2020/DCI-P3/Display P3/ACES AP0/AP1)、Kim 2002 多項式近似 Planckian ローカス、McCamy 1992 CCT推定。スコープ表示用バッファサンプリング (`sampleBufferChromaticities`)。43 テスト。
- **`timeline/scene-detector.ts`** — ヒストグラム比較によるシーンチェンジ検出。BT.601 輝度ヒストグラム計算。Chi-square / Bhattacharyya / SAD の3距離指標。`createSceneDetector()` でストリーミング逐次検出、`detectSceneCuts()` でバッチ一括解析。`minSceneDuration` デバウンスでフェード時の多重検出を防止。39 テスト。
- **`animation/spring-physics.ts`** — 減衰調和振動子の解析的閉形式解。Underdamped (ζ<1) / Critically damped (ζ=1) / Overdamped (ζ>1) の3レジームを正確に処理。`createSpringAnimation()` で任意時刻の位置/速度を解析的にサンプリング。`settlingTime()` で高密度スキャンによる収束時間推定。半陰解法オイラー `springStep()` / `isAtRest()` でゲームループ対応。`SPRING_PRESETS` (bouncy/wobbly/gentle/stiff/slow/molasses) を同梱。43 テスト。
- **`audio/loudness-meter.ts`** — EBU R128 / ITU-R BS.1770-4 ラウドネスメーター。K-ウェイティング（プレフィルタ＋RLB 高域通過、バイリニア変換で任意サンプルレート対応）。Momentary (M, 400ms) / Short-term (S, 3s) / Integrated (I, 絶対/相対ゲーティング) / Loudness Range (LRA, 10th–95th 百分位数) / Sample Peak (dBFS)。`measureLoudness()` オフライン一括計測、`createLoudnessMeter()` ストリーミング（任意ブロックサイズ、フィルタ状態を跨がず保持）。既存の `audio/biquad-filter.ts` の `BiquadCoeffs` / `BiquadState` / `processSample` / `applyFilter` を再利用。38 テスト。
- **`color/white-balance.ts`** — 自動ホワイトバランス解析・ゲイン補正。Gray World (Buchsbaum 1980 平均輝度推定) / White Patch (Max RGB 最大輝度推定) / Percentile (ヒストグラム分位推定、デフォルト98th) の3アルゴリズム + 明示的光源指定 `illuminantGains()`。von Kries 対角ゲインモデル (緑チャンネル基準正規化)。`applyWhiteBalance()` で RGBA バッファ in-place 補正、`composeGains()` で連鎖補正、`invertGains()` で補正の取り消し。`estimateWhiteBalance()` 統一 API。45 テスト。

## [3.0.0] - 2026-05-23

### Added
- Apple HIG 準拠デザインシステム (design-system.ts — 色/スペース/タイポ/モーション/z-index 一元化)
- First-Run Experience (3ステップオンボーディング、レベル選択、テンプレート)
- Command Palette (Cmd+K、Spotlight 式ファジー検索、日本語エイリアス対応)
- ErrorBoundary (白画面防止、リカバリ UI)
- DropZone (全域ファイルドロップ、Apple の触感再現)
- Browser Capabilities 検出 (WebGPU/WebCodecs graceful degradation)
- OTIO 1.0 / EDL CMX 3600 / FCPXML 1.10 互換層
- SBOM 生成 (CycloneDX 1.5 + SPDX 2.3)
- OSV API 連携 CVE スキャン
- WCAG 2.1 AAA 自動監査
- CI 9項目チェック (色/テーマ/token/孤立/テスト/dead code/CLAUDE.md/localStorage/console.log)
- CVSS v3 ベクトル計算 (Log4shell=10.0 検証済み)
- SHA256 チェックサム検証付きインストーラ
- パフォーマンス退行検出 (bench/ CI gate)
- 11言語 i18n (ja/en/zh-Hans/zh-Hant/ko/es/fr/de/pt/ru/ar、各199キー完全一致)
- app/utils.ts 共通ユーティリティ (safeStorage/clamp/lerp/uuid/formatBytes/formatTimecode)
- HistoryManager ブランチ履歴、IndexedDB 永続化
- KeyframeAnimator、MotionGraphicsEngine
- CaptionManager (SRT/VTT/ASS インポート)

### Changed
- shell.tsx を唯一の React root に統一 (entry.tsx → shell.tsx → EngineProvider)
- main.ts から DOM 生成コード 257 行削除 (React 層に委譲)
- featureTier: essential/standard/pro の段階的開示
- any 型: production コード 50 → 0
- console.log: production コード 28 → 0
- localStorage 直書き → safeStorage() 経由に統一
- dead code 3,665 行を future/ に隔離

### Fixed
- init() に個別 try/catch — 部分初期化でも白画面にならない
- importMedia / exportProject の optional chaining → 明示的エラー
- stale closure (useEffect 空依存配列 + setState 関数型更新)
- CVSS パース: CVSS:3.X バージョン部除外
- DiagnosticPanels sed 置換バグ

### Security
- SBOM + OSV CVE スキャン CI gate
- SHA256 チェックサム付きダウンロード検証
- supply chain: MIT 互換ライセンスのみ


### Improved (Session 56b — 改善ラウンド)
- tsx を devDependencies に追加 — bench/sbom スクリプトを CI で実行可能に
- bench/baseline.json を実値で初期化 — 退行検出機能の即時起動
- security/cve-database.ts 追加 — 12個のキュレートCVE で security ゲート機能化
- A11y E2E テスト self-contained 化 — module path 解決問題を回避
- ESLint flat config (v9+) 追加 — 厳しめルール (max-depth/complexity/max-lines)
- Skill 4個追加: security-review / a11y-review / interchange-review / bench-review
- i18n Tier1 完全対応 (11言語): ja/en/zh-Hans/zh-Hant/ko/es/fr/de/pt/ru/ar
- 全11言語199キー完全一致 (RTL対応含む)
- otio.ts 未使用 import 削除

### Added (Session 56)
- `interchange/` モジュール — OTIO 1.0 / EDL CMX 3600 / FCPXML 1.10 互換層
- `bench/` モジュール — パフォーマンス退行検出システム (CI gate)
- `accessibility/` モジュール — WCAG 2.1 AAA 自動監査
- `security/` モジュール — SBOM (CycloneDX 1.5 / SPDX 2.3) + サプライチェーン監査
- ユニットテスト: interchange / quality (bench, a11y, supply chain)
- E2E A11y テスト (Playwright)
- CI ジョブ: bench / security / a11y
- 運用スカフォールド (CLAUDE.md / .claude/skills / hooks)
- リスクゾーン別 CLAUDE.md (recovery / audio / render / plugins / interchange / bench / accessibility / security)
- i18n 基盤 (1000+ 言語対応)
- GitHub repo 構成 (LICENSE / CONTRIBUTING / SECURITY / CoC)

### Improved (Self-review fixes)
- OTIO Transition 正式対応 (export/import 両対応, SMPTE_Dissolve / dissolve round-trip)
- EDL reel name 衝突回避 (連番 suffix 自動付与)
- FCPXML sequence duration 実計算 (旧: 0s → 全クリップ最終フレーム)
- SBOM hash 形式変換 (npm integrity base64 → SPDX hex)
- A11y JSDOM 対応 (DOMHost 抽象化, Node 環境で実行可能)
- bench しきい値カスタマイズ (per-bench 上書き)
- bench 実環境ホットパス追加 (canvas putImageData / typed array copy / audio mix / alpha composite / CRC32)
- bench 初回実行時 baseline 自動生成 (フリクション削減)
- 未使用 import 削除 (legacy-formats.ts)
- package.json: tsx + jsdom 依存宣言

### 10年運用基盤
- OTIO 互換 → 他NLE往復編集可能 (DaVinci/Premiere/FCP/Avid)
- パフォーマンス退行 CI で自動阻止 (critical >0 で fail)
- WCAG AAA 自動監査 (アクセシビリティ品質維持)
- SBOM 生成 + CVE スキャン (サプライチェーン保護)

## [3.0.0] - 2026-04-26

### Added
- WebCodecs パイプライン (H.264/H.265/VP9/AV1)
- WebGPU レンダリングエンジン (60fps)
- マグネティックタイムライン (FCP風)
- カラーグレーディング (DaVinci級 / HDR10 / HLG / Dolby Vision)
- オーディオエンジン (Fairlight級 / 5.1/7.1/Atmos)
- ローカル AI 処理 (Transformers.js / WebGPU 推論)
- Yjs 協調編集 (Figma風)
- VST/AU プラグイン WASM ブリッジ
- 分散レンダリング (Worker Pool / S3/R2/MinIO)
- ライブ配信 (WebRTC/HLS/RTMP / YouTube/Twitch)
- Capacitor iOS/Android ブリッジ
- Undo/Redo (Command Pattern / ブランチ履歴)
- Video Scopes (Waveform/Vectorscope/Histogram/RGB Parade)
- Performance Monitor (FPS/GPU/Memory / 自動品質調整)
- Crash Recovery / 自動バックアップ
- Proxy Workflow (高解像度自動プロキシ)
- PWA (Service Worker / オフライン対応)
- マルチカム / ネスト / マーカー
- Text-based Editing (Descript風)
- Motion Graphics / Keyframe Animator
- Caption Manager
- Batch Processor
- Project Manager / Media Browser

### Architecture
- 24+ モジュール / ~600KB / ~16,200 行 TypeScript
- React + TypeScript + WebCodecs + WebGPU + IndexedDB
- Vite ビルド / Vitest / Playwright
- Cloudflare Pages / Vercel デプロイ対応
- GitHub Actions CI/CD

### Documentation
- 100_POINTS_ARCHITECTURE.md
- README.md / CLAUDE.md
- Module-level CLAUDE.md
