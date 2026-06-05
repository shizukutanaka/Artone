# Artone 改善点リスト — 同種ソフト & arXiv 研究ベース

> 作成日: 2026-06-05 / 手法: 競合 NLE・AI動画エディタの機能比較 + arXiv 最新研究の調査。
> Artone の各モジュール現状（コード実地確認）にマッピングし、優先度を付与。
>
> **設計制約の遵守**: Artone は「100%ローカル / サーバーレス / Web標準のみ」。
> 競合のクラウド依存機能（クラウドAvatar、ストック素材、クラウド協調）は採用せず、
> **ローカル完結で等価な価値を出せるもの**のみを改善対象とする。

---

## 1. 競合ギャップ分析（同種ソフト）

| 機能 | DaVinci 20 / Premiere(2026) / CapCut / Descript | Artone 現状 | 区分 |
|---|---|---|---|
| テキストベース編集（字幕=動画編集） | Descript の中核 | `timeline/text-based-editing.ts` **実装済** | ✅ 強み |
| 自動字幕（ASR） | 各社標準 | `ai-effects-engine.ts` に Whisper モデル登録のみ・`captions/` 未連携 | ⚠️ scaffold |
| オブジェクトマスク追跡（Magic Mask / AI Object Mask） | DaVinci/Premiere 標準 | SAM2-tiny 登録あり（arXiv 2408.00714）・伝播/UI 未実装 | ⚠️ scaffold |
| 背景除去 / マッティング | CapCut/Premiere | `removeBackground()` あり（BodyPix/Selfie）・品質/縁処理は要改善 | ⚠️ 部分 |
| 音声分離（ボーカル/伴奏ステム） | DaVinci 周辺・CapCut | **なし** | ❌ 欠落 |
| ノイズ除去 / ボイス強調（AI） | DaVinci Voice Isolation | `audio-engine.ts` は "simple noise gate" の DSP のみ | ⚠️ 簡易 |
| ニューラル超解像 / フレーム補間 | 各社（一部） | ESRGAN 4x 登録のみ・render/export 未連携 | ⚠️ scaffold |
| 生成的延長（Generative Extend / outpaint） | Premiere(Firefly) | **なし** | ❌ 欠落 |
| 脚本→タイムライン自動生成（IntelliScript / CapCut AI Agent） | DaVinci 20 / CapCut | **なし** | ❌ 欠落 |
| ACES カラーマネジメント（IDT/ODT/ACEScg） | DaVinci 標準 / AE(OCIO) | `hdr-engine.ts` は ACES *tonemap* のみ | ⚠️ 部分 |
| リアルタイム協調編集 | Kapwing 強み | `collab/` Yjs **実装済** | ✅ 強み |
| 自動リフレーム（アスペクト比再構成） | CapCut/Premiere | **なし** | ❌ 欠落 |
| 自動ダッキング（BGMをセリフ下で減衰） | 各社 | **なし** | ❌ 欠落 |
| バックグラウンド書き出しキュー | 全 NLE 標準 | `export/` は単発・キュー無し | ⚠️ 部分 |
| プロコーデック入力（ProRes/DNxHD/RAW） | 全 NLE | WebCodecs 依存・未カバー（業界共通の限界） | ⚠️ 限界 |

**結論**: Artone は基盤（WebCodecs/WebGPU/Yjs/text-based編集/scopes/OTIO 互換）が競合と同等以上。
差は主に **「AIモデルの scaffold が未実装・未連携」** と **少数の欠落機能**に集中している。
→ ゼロからの新規より「scaffold の完成 + 最新研究での品質/速度引き上げ」が費用対効果最大。

---

## 2. モジュール別 arXiv ベース改善

### ai/ — ローカル推論（最重要）
- **現状**: `ai-effects-engine.ts` に Whisper(tiny/base/large-v3)・SAM2-tiny・ESRGAN・BodyPix を*登録*。実推論の多くは未実装/プレースホルダ。
- **改善 & 根拠**:
  - Whisper の **INT4/5/8 量子化**で edge レイテンシ最適化（arXiv 2503.09905）。Artone は既に q4/q8 指定済み → 量子化別ベンチで既定を確定。
  - **二段デコードのストリーミング Whisper**でライブ字幕（arXiv 2506.12154）。同一音声の再処理を避け効率化。
  - 1GB 未満・CPU でリアルタイム超のコンパクト ASR を WebGPU 非対応端末のフォールバックに（arXiv 2604.14493）。
  - 生成系（背景除去後の inpaint / outpaint）は **拡散モデルの W8A8/W6A6 量子化**でブラウザ実用化（arXiv 2502.04056 TQ-DiT, 2506.22463 Modulated Diffusion）。

### captions/ — 自動字幕（Descript 級ワークフロー強化）
- **現状**: SRT/VTT/ASS の取り込み/描画のみ。ASR 未連携。
- **改善**: `ai-effects-engine` の Whisper を `captions/` に配線し、**音声→自動字幕→`text-based-editing` で文章編集＝動画編集**を一気通貫に。これは既存2モジュールの結線のみで Descript の中核体験を完成できる、最高 ROI 項目。

### audio/ — ニューラル音声処理（DaVinci Voice Isolation 対抗）
- **現状**: `noise-reduction`/`voice-enhance` は単純ノイズゲート/簡易DSP。
- **改善 & 根拠**:
  - **軽量ニューラルノイズ除去**（arXiv 2509.16705 Reverse Attention, 2409.18239 626k params・3.35ms）を WASM/WebGPU で実装。
  - **音楽ソース分離（ボーカル/伴奏ステム）**を新規追加（arXiv 2511.13146 RT-STT, 2309.08684 DTTNet, 2407.00657 MMDenseNet）。量子化で実時間化（2511.13146 が量子化で速度向上を実証）。カラオケ/リミックス/セリフ抽出に有用。

### render/ + perf/ — 超解像・補間・ゼロコピー
- **改善 & 根拠**:
  - **リアルタイム動画超解像**（540p→4K）を WebGPU エフェクト/書き出しに（arXiv 1609.05158 ESPCN sub-pixel, AIM2024 2409.17256 圧縮動画向け）。ESRGAN scaffold を実装に昇格。
  - **時空間 SR / フレーム補間**で高品質スローモー・フレームレート変換（arXiv 2104.05778）。
  - **VideoFrame→WebGPU ゼロコピー**（`importExternalTexture`）で dual-GPU の CPU↔GPU 余分コピーを排除（W3C WebCodecs issue #873 の既知ボトルネック）。`perf/` の自動品質と連動。

### color/ — ACES カラーマネジメント
- **現状**: `hdr-engine.ts` は ACES *トーンマップ*と colorspace enum のみ。
- **改善**: **ACEScg ワーキングスペース + IDT/ODT（OpenColorIO 準拠）**を追加し、業界標準の往復（DaVinci/AE）に対応。HDR10/HLG は既存を流用。

### collab/ — 大規模プロジェクトの協調効率
- **現状**: Yjs（実績十分、26K–156K ops/s）。
- **改善**: 大規模・長尺タイムラインのメモリ/起動時間に向け **Eg-walker**（EuroSys'25, arXiv 2409.14252「Better, Faster, Smaller」）を評価。CRDT のテキスト系メタ（マーカー/字幕/コメント）に適用余地。少なくとも採否を技術メモ化。

### interchange/ + core/ — コーデックと互換
- **改善**: WebCodecs 非対応の **ProRes/DNxHD デコードを WASM フォールバック**で限定対応（業界共通の限界に対する現実解）。**AV1 圧縮素材向け効率 SR**（arXiv 2409.17256）を proxy/プレビューに。

### timeline/ + export/ — ワークフロー自動化
- **改善 & 根拠**:
  - **脚本→ラフカット自動生成**（DaVinci IntelliScript / CapCut AI Agent 相当）を WebLLM/ローカルLLM + 既存 text-based 編集で実現。
  - **自動リフレーム**（被写体追従でアスペクト比再構成、SAM2/顔検出を流用）。
  - **自動ダッキング**（音声検出で BGM を実時間減衰、audio-engine に追加）。
  - **バックグラウンド書き出しキュー**（proxy ベース高速書き出し + 進捗/再開）。長尺で競合が抱える「書き出しでクラッシュ/遅い」課題への対策。

---

## 3. 優先度ロードマップ

**P0（最高 ROI・既存資産の結線/完成）**
1. captions ← ai(Whisper) 配線 → 自動字幕 → text-based 編集の一気通貫（Descript 級体験の完成）。
2. SAM2-tiny の object mask 伝播 + UI（Magic Mask 対抗、scaffold 完成）。
3. VideoFrame→WebGPU ゼロコピー（全プレビュー/エフェクトの土台性能）。

**P1（競合パリティの主要欠落）**
4. AI ノイズ除去 / ボイス分離・ステム（audio）。
5. ニューラル超解像（ESRGAN 実装昇格）+ フレーム補間。
6. ACES カラーマネジメント（IDT/ODT/ACEScg）。
7. バックグラウンド書き出しキュー。

**P2（差別化・先進機能）**
8. 脚本→タイムライン自動生成（ローカルLLM）。
9. 生成的延長 / outpaint（量子化拡散）。
10. 自動リフレーム / 自動ダッキング。
11. Eg-walker 協調エンジン評価。
12. ProRes/DNxHD 入力フォールバック。

各項目は CLAUDE.md のワークフロー（要件→既存確認→設計→実装→テスト[リスクゾーン95%+]→ドキュメント）に従って個別 PR 化する。

---

## 4. 参考文献

**競合 / 市場**
- Best AI Video Editing Tools 2026 (CapCut vs Premiere vs DaVinci vs Descript) — https://www.techno-pulse.com/2026/04/best-ai-video-editing-tools-in-2026.html
- DaVinci/Premiere/FCP/CapCut 比較 — https://www.subclip.app/compare/7-best-video-editing-software
- Browser video editing (WebGPU/WASM 95% native) — https://byteiota.com/browser-video-editing-webgpu-wasm-performance/
- WebCodecs API — https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- Dual-GPU コピー問題 — https://github.com/w3c/webcodecs/issues/873
- OpenColorIO / ACES (After Effects) — https://helpx.adobe.com/after-effects/using/opencolorio-aces-color-management.html

**arXiv**
- Whisper 量子化（INT4/5/8）— https://arxiv.org/abs/2503.09905
- ストリーミング Whisper（二段デコード）— https://arxiv.org/pdf/2506.12154
- On-Device ストリーミング ASR（<1GB, CPU 実時間超）— https://arxiv.org/abs/2604.14493
- 軽量ニューラル音声強調（Reverse Attention）— https://arxiv.org/pdf/2509.16705
- サブミリ秒 音声強調（626k params）— https://arxiv.org/html/2409.18239v2
- リアルタイム音楽ソース分離 RT-STT — https://arxiv.org/abs/2511.13146
- 軽量分離 DTTNet — https://arxiv.org/abs/2309.08684
- リアルタイム伴奏分離 MMDenseNet — https://arxiv.org/pdf/2407.00657
- 効率的動画超解像（ESPCN sub-pixel）— https://arxiv.org/abs/1609.05158
- AIM 2024 効率動画SR（AV1圧縮素材）— https://arxiv.org/html/2409.17256v1/
- 時空間SR + フレーム補間 — https://arxiv.org/pdf/2104.05778
- 拡散モデル量子化 TQ-DiT（W8A8/W6A6）— https://arxiv.org/pdf/2502.04056
- Modulated Diffusion 加速 — https://arxiv.org/pdf/2506.22463
- Eg-walker 協調編集（EuroSys'25）— https://arxiv.org/pdf/2409.14252
- SAM2（動画オブジェクトマスク伝播・コード内で既参照）— https://arxiv.org/abs/2408.00714
