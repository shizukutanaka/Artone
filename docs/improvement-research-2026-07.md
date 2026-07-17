# Artone v3 改善点リサーチ 2026-07 — 最新論文・API動向・業界実装の調査結果

調査日: 2026-07-16 (v3.1.0 リリース直後)。3系統の並列調査 (ブラウザメディアAPI / AI・研究論文 / 業界実装・協調編集) の統合レポート。全主張に出典 URL を付し、検証できなかった項目は捏造せず明示的にフラグしている。

対象読者: 次の開発サイクルの計画者 (人間 / AI エージェント問わず)。各項目に対象モジュール・概算工数 (S: 〜1日 / M: 〜1週 / L: 複数週)・依存関係を記載。

---

## 0. アーキテクチャの外部検証 (結論: 現方針は正しい)

**Artone の「WebCodecs ファースト・100%ローカル・サーバーレス」構成は 2025-2026 の業界実装で強く裏付けられた。**

- **Descript (2026)**: Electron + ネイティブ FFmpeg + WebGL テクスチャコピー構成 (実用 720p 上限) を捨て、約4年かけて WebCodecs ベースの Web アプリへ移行。「ハードウェアデコーダ/エンコーダと WebGL/WebGPU 間のゼロコピーインターフェース」と評価。4K フレーム 1枚 33MB・30fps で約1GB/秒というコピーコスト問題を WebCodecs が直接解決。2025年5月に本番リリースし、多くのケースでデスクトップ版より高速。
  https://www.descript.com/blog/article/the-new-descript-how-we-multiplied-the-apps-speed-and-performance
- **Remotion (2025)**: `@remotion/webcodecs` を ffmpeg.wasm 比 **5倍以上高速**とベンチマーク (Chrome 131/M2)。その後自社ライブラリを段階的に畳み、**Mediabunny** をスポンサー ($1000/月) して Web 標準のマルチメディアツールキットとして推す方向に転換 — エコシステムが WebCodecs ネイティブ路線に収斂している証左。
  https://www.remotion.dev/docs/webcodecs/misconceptions / https://github.com/remotion-dev/webcodecs-benchmark / https://www.remotion.dev/blog/mediabunny
- **オープンソースの同型プロジェクト**: Omniclip (https://github.com/omni-media/omniclip 「ローカルファースト・アカウント不要・アップロード無し」) と OpenReel Video (https://github.com/Augani/openreel-video) が Artone と同一思想 (WebCodecs + WebGPU、サーバーレス) で実際に動いている。
- **Kapwing**: タイムラインサムネイル生成を Web Worker + WebCodecs でメインスレッド外に出す構成を Chrome チームと共同で採用。
  https://www.kapwing.com/blog/working-with-google-chrome/

---

## 1. 優先度順 改善点リスト

### P1 [L] デマルチプレクサ導入 — 「実ファイルを開けない」最重要ギャップの解消

- **現状**: `core/codec-router.ts` は「FFmpeg WASM でトランスコードすべきか」を判定するが、FFmpeg WASM もその他のデマルチプレクサも存在せず判定結果は no-op (`app/main.ts` はログを出して通常インポートに進む)。実 MP4/MOV/MKV から H.264/AAC のエレメンタリストリームを取り出せないため、WebCodecs デコードパイプライン (`VideoPipeline`) 全体が未配線のまま。
- **提案**: **Mediabunny を第一候補**として評価 (Remotion が自社実装を畳んでまで統一先に選んだ、WebCodecs ネイティブな demux/mux ライブラリ)。ffmpeg.wasm はバンドルサイズと速度 (上記 5倍差) で不利。**注**: バンドルサイズ/ライセンス/保守状況の一次確認は本調査で未完 (担当エージェントの調査が部分完了で終了) — 採用前に npm/GitHub で要確認。
- **対象**: `core/` (codec-router の実体化)、`media/` (インポート経路)
- **依存**: なし (最初に着手すべき)。P2/P5/P9 のブロッカー。
- **出典**: 上記 Remotion/Mediabunny、JSConf India 講演「WebCodecs は生チャンクを返すだけでコンテナ処理は別途必要」 https://gitnation.com/contents/pushing-the-limits-of-video-encoding-in-browsers-with-webcodecs (2023年、より新しい同種講演は 2025-2026 に見つからず)

### P2 [L] エクスポート配線 — タイムライン → レンダリング → エンコード

- **現状**: `app/main.ts` の `exportProject()` は明示的に throw (サイレントな空ファイル生成を防ぐ設計判断としては正しい)。muxer (`export/mp4-muxer.ts`/`webm-muxer.ts`) とエンコーダ (`export/export-engine.ts`) は実装・テスト済みで、v3.1.0 で境界バグも修正済み。欠けているのは「タイムライン状態 → フレーム列」のレンダリングループのみ。
- **依存**: 実素材のエクスポートには P1 が必要。ただし生成コンテンツ (テキスト/シェイプ/カラー) のみのエクスポートなら P1 なしで着手可能 — 段階的に価値を出せる。
- **対象**: `app/main.ts`、`render/`、`export/`

### P3 [M] Transformers.js v2 → v4 移行 — WebGPU 推論の解禁

- **現状**: `@xenova/transformers ^2.17.2` (2024-05-29 公開、WASM のみ)。後継 `@huggingface/transformers` は **v3 (2024-10-22) で WebGPU 対応** (発表では最大100倍高速)、**v4.0.0 (2026-03-30)、最新 v4.2.0 (2026-04-22)** — npm レジストリ直接照会で確認済み。**3メジャーバージョン遅れ**。
- **破壊的変更**: パッケージ名変更 + v4 でトークナイザが `@huggingface/tokenizers` に分離。ドロップイン移行不可。
- **注意**: ONNX Runtime Web の WebGPU バックエンドは公式には今も "experimental" 表記 (https://onnxruntime.ai/docs/build/web.html)。Transformers.js 経由での利用が実世界の標準パターン (Moonshine Web 等) であり、単体採用の利点は確認できず。
- **対象**: `ai/` (同ディレクトリの CLAUDE.md は「人間判断待ち」と記載 — 移行判断自体はメンテナ承認を推奨)
- **依存**: P5 のブロッカー。
- **出典**: https://huggingface.co/blog/transformersjs-v3 / npm レジストリ (`registry.npmjs.org/@huggingface/transformers` dist-tags.latest = 4.2.0)

### P4 [M] WebGPU レイヤ変換 (position/scale/rotation) の実装

- **現状**: `render/webgpu-engine.ts` はコンポジットするがレイヤ変換未適用 (本セッション監査で座標系規約が未定のため保留と判断した項目)。
- **確立済みパターン (外部リファレンス)**:
  - 変換行列: webgpufundamentals のシーングラフ方式 — 各ノードに `localMatrix`、`updateWorldMatrix` で親子伝播、レイヤ/トラック階層と同型。 https://webgpufundamentals.org/webgpu/lessons/webgpu-scene-graphs.html
  - 行列ライブラリ: **wgpu-matrix** (WGSL のアライメント/クリップ空間 0..1 Z 前提で設計) https://github.com/greggman/wgpu-matrix
  - ゼロコピー動画テクスチャ: `importExternalTexture()` + WGSL `texture_external` (バインドグループは**毎フレーム作り直し**が仕様上必須)。 https://webgpufundamentals.org/webgpu/lessons/webgpu-textures-external-video.html / Chrome 118 で WebCodecs VideoFrame → GPUExternalTexture 直結が安定化 https://chromestatus.com/feature/5078348864159744
  - 実装参考リポジトリ: FreeCut (transform/crop/corner-pin ギズモ + 25 ブレンドモードを WebGPU で実装) https://github.com/walterlow/freecut
- **オプション**: dual-source blending (`@blend_src`、Chrome 130+) で Porter-Duff 合成をシングルパス化。 https://chromestatus.com/feature/5167711051841536
- **対象**: `render/webgpu-engine.ts`。**実機 GPU 検証必須** (render/CLAUDE.md 規定)。

### P5 [M] 自動字幕の実モデル接続 (P3 依存)

- **100%ローカル STT の現在の最適解** (いずれも Transformers.js v3+ WebGPU の公式デモあり):
  - **Moonshine** (tiny 5.8M / base 61M パラメータ、リアルタイム向け設計、Whisper Tiny 超え) https://huggingface.co/UsefulSensors/moonshine-base / 公式 Web デモ https://huggingface.co/posts/Xenova/486935205804807
  - **whisper-large-v3-turbo** (デコーダ 32→4層、高品質寄り) https://huggingface.co/onnx-community/whisper-large-v3-turbo
  - 軽量代替: distil-whisper (英語のみ ~185MB)、whisper.cpp WASM (CPU のみ、最軽量) https://ggml.ai/whisper.cpp/
- WebGPU による 5-10倍高速化の数字はブログ由来 (独立検証なし) — 方向性は確かだが数値は参考値。
- **対象**: `captions/`、`ai/`

### P6 [S] color/ に AgX トーンマッピングを第6オペレータとして追加

- 既存5種 (Reinhard/ACES/Hable/Uchimura/Lottes) を置き換える研究は 2025-2026 に見当たらず — 実装は現役標準のまま。唯一の実質的新顔が **AgX** (Blender 4.0 以降のデフォルト、ハイライト脱飽和が自然、シェーダ移植可能なリアルタイムオペレータ)。darktable/RapidRAW にも波及中。
  https://developer.blender.org/docs/release_notes/4.0/color_management/
- ML 系 (GTA-HDR、拡散モデルトーンマッピング) は LDR→HDR 復元という別問題であり 60fps プレビューには非現実的 — 対象外と判断。
- **対象**: `color/` (CPU/GPU パリティ規約に従い両実装 + 実機検証)

### P7 [S] WebGPU 新機能の限定活用 (Chrome/Edge 先行)

- **subgroups**: Chrome 134 (2025-02) 安定化。ヒストグラム集計・LUT リダクション等の compute カーネル高速化に有効 (Google Meet で 2.3-2.9倍の実績)。Firefox/Safari は意向表明のみ — **フォールバック必須のプログレッシブ強化として扱う**。 https://github.com/gpuweb/gpuweb/blob/main/proposals/subgroups.md
- **shader-f16**: half-float LUT/カーブバッファに有効。Firefox 141 (Win)/145 (Apple Silicon) 対応。Safari は未確認。
- **timestamp-query**: Chrome は 100µs 量子化 + cross-origin isolated 限定 — `perf/` の精密 GPU 計測用途には不十分と判明 (perf/CLAUDE.md の「WebGPU timestamp query で GPU 計測」方針は精度制約を前提に再検討)。
- **HDR canvas (rec2100)**: まだ提案段階。`color/` の HDR 出力は当面 SDR トーンマップ経由が正解。 https://github.com/ccameron-chromium/webgpu-hdr/blob/main/EXPLAINER.md
- **Safari**: WebGPU は Safari 26 (2025-09-15) でデフォルト有効 — README の動作要件 (Safari 17+) に WebGPU 利用時は Safari 26+ の注記を追加検討。 https://webkit.org/blog/17333/webkit-features-in-safari-26-0/

### P8 [判断] 未配線モジュールの活殺 — 調査に基づく提言

| モジュール | 調査結果 | 提言 |
|---|---|---|
| `collab/` (Yjs + y-webrtc) | y-webrtc は v10.3.0 (2023-12) が最新のまま = Artone は最新版。ただし **P2P でもシグナリングサーバは原理的に必須**。実運用の「serverless」は全て FaaS 依存 (例: Lambda シグナリング https://medium.com/collaborne-engineering/serverless-yjs-72d0a84326a2)。真のゼロインフラは手動 SDP 交換か DHT (Peersuite 型) のみで、いずれもホビー水準。 | 「サーバーレス原則と両立しない」ことを明文化し、**手動 SDP 交換のニッチモードとして限定実装するか、明示的に凍結**。現状の未配線を「バグ」扱いしない。 |
| `plugins/plugin-bridge.ts` (VST/AU WASM) | W3C Audio WG に プラグイン標準化の計画なし (2026-11 まで再チャーター済みだが対象外)。**web-clap** (CLAP の WASM 化) はドラフト段階 https://github.com/free-audio/web-clap、動く PoC あり https://github.com/Signalsmith-Audio/wasm-clap-browserhost。**WAM 2.0** は最古参だが 2025-2026 の活動を確認できず。 | 自前ブリッジは両コミュニティ努力と同一プリミティブ (WASM + AudioWorklet) で設計済み — **待つ標準は無い**。web-clap の成熟をウォッチしつつ、配線するなら自前 ABI で進めて良い。 |
| `keyframes`/`motionGfx` | 外部要因なし (純粋に内部配線の問題) | タイムラインへの統合設計を P2 と同時に検討 (レンダリングループが両者の消費者になる) |
| `scopes/` 実フレーム供給 | 同上 | P1 完了後に自然に解決 (デコード済みフレームが得られるようになる) |

### P9 [S/未完] OPFS (Origin Private File System) の評価 — 要追加調査

- IndexedDB Blob と OPFS + `FileSystemSyncAccessHandle` の比較は担当エージェントの調査が部分完了で終わり、**一次情報での検証未了**。マルチ GB のメディア/プロキシ格納 (`media/`、`recovery/`) には有望と目されるが、ブラウザ対応マトリクスと実測比較を次回調査で確定させること。**本項は結論を出していない** — 現時点で移行判断をしないこと。

### P10 [ウォッチ] 研究論文 (2025-2026、実装は時期尚早)

| 論文 | 内容 | ブラウザ適用性 |
|---|---|---|
| OmniShotCut (arXiv:2604.24762, 2026-04) | ショット境界検出の Transformer、合成遷移 11.9M で学習 | ONNX/ブラウザ移植は未存在。将来の自動分割候補 https://arxiv.org/abs/2604.24762 |
| オンデバイス話者ダイアライゼーション (arXiv:2606.08505, 2026-06) | Pyannote 3.1 系を最大12.2倍高速化、精度ほぼ維持 | Pyannote は ONNX 化経路あり — 4本中最も移植可能性が高い https://arxiv.org/abs/2606.08505 |
| AutoCut (arXiv:2603.28366, CVPR 2026) | マルチモーダル LLM による広告動画自動編集 | 大規模 LLM 前提 — 100%ローカル制約と非両立 |
| Prompt-Driven Agentic Video Editing (arXiv:2509.16811) | プロンプトで長尺素材を再構成 | 同上 (クラウド LLM 前提) |
| (該当なし) | 無音/フィラー除去の専用軽量モデル | 学術論文は発見できず — 実務は波形 VAD + Whisper 文字列マッチで実現されている (捏造回避のため明記) |

---

## 2. 推奨着手順序

```
P1 デマルチプレクサ (L) ──→ P2 エクスポート配線 (L) ──→ scopes 実フレーム (P8)
                     └────→ P5 自動字幕 (M) ←── P3 Transformers.js v4 (M)
P4 WebGPU 変換 (M, 実機検証必須) — 独立着手可
P6 AgX (S) / P7 WebGPU 新機能 (S) — 独立着手可
P8 collab/plugin の活殺明文化 (S, ドキュメント作業)
P9 OPFS 追加調査 (S)
```

P1 と P2 が製品価値の大半 (「実ファイルを読み書きできる編集アプリ」になる) を占める。P3-P7 は独立に価値を出せる中小粒度。

## 3. 調査の限界 (正直な記録)

- ブラウザメディア API 担当エージェントの調査は WebGPU 部分のみ完了し、**demux/mux ライブラリ比較の一次確認 (サイズ/ライセンス/保守状況)・WebCodecs の Safari 対応マトリクス・OPFS 評価は未完** — P1 着手前に要追確認。
- WebFetch が多数のドメインで 403 となったため、一部の主張は検索スニペット経由の裏取り (各項目に明記)。npm レジストリ・GitHub README は直接取得できており高信頼。
- 本レポートの数値のうち「WebGPU で 5-10倍」等のブログ由来値は参考値扱い。
