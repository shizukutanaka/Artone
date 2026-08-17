# core/ — WebCodecs パイプライン (デコード/エンコード基盤)

## リスク
- プラットフォーム差異 (codec support) に注意\n- Worker 間メッセージパッシングのオーバーヘッド

## ルール
- EncodedVideoChunk / VideoFrame は use-after-close に注意\n- codec capability は事前チェック\n- メモリ管理: VideoFrame.close() を必ず呼ぶ

## ファイル
- webcodecs-pipeline.ts


## 新規モジュール (2026-05, arXiv/業界知見ベース)
- `codec-router.ts` — WebCodecs/FFmpeg WASM ルーティング。コーデック分類 (native/transcode/unknown) + コンテナ分類でファイル処理経路を決定。
  - ProRes/DNxHR/Cineform → FFmpeg WASM transcode (H.264中間)
  - MXF/AVI/FLV/TS/M2TS コンテナ → FFmpeg demux 必須
  - **MP4/M4V/MOV/MKV/WebM はブラウザ内で demux 可能** (2026-08 更新)。
    デマルチプレクサ `media/media-metadata.ts` (Mediabunny) 導入により、
    従来「FFmpeg demux 必須」としていた MOV(QTFF)/MKV(Matroska) が native へ移行。
    `NATIVE_CONTAINERS` は `DEMUXABLE_EXTENSIONS` と一致必須
    (`tests/codec-router.test.ts` が同期を固定)。
  - コンテナ判定 (demux 可否) とコーデック判定 (デコード可否) は**独立**。
    例: ProRes 入り .mov は demux 可能だがデコード不可 → transcode 経路。
  - needsFFmpegWasm() で FFmpeg WASM (大) の遅延ロード判定

## 設計根拠
- Dayverse: WebCodecs は OS コーデック API 呼び出しで10-50倍速だが ProRes/DNxHD 非対応。
- Remotion: WebCodecs と WebAssembly は無関係 (WebCodecs はネイティブ実装)。
- frameflow: WebCodecs 優先 + FFmpeg WASM フォールバックのハイブリッド構成。
