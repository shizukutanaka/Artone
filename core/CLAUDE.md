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
  - MOV/MKV/MXF コンテナ → FFmpeg demux 必須
  - needsFFmpegWasm() で FFmpeg WASM (大) の遅延ロード判定

## 設計根拠
- Dayverse: WebCodecs は OS コーデック API 呼び出しで10-50倍速だが ProRes/DNxHD 非対応。
- Remotion: WebCodecs と WebAssembly は無関係 (WebCodecs はネイティブ実装)。
- frameflow: WebCodecs 優先 + FFmpeg WASM フォールバックのハイブリッド構成。
