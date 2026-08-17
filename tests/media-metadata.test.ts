/**
 * Tests for media/media-metadata.ts
 *
 * Mediabunny のコンテナ解析は純 TS (WebCodecs 不要) なので jsdom で検証できる。
 * 実 MP4 を Mediabunny 自身で **書き出して** から本モジュールで **読み戻す**
 * ラウンドトリップにより、フィクスチャの妥当性と抽出結果を同時に担保する
 * (フィクスチャが不正なら書き出し/読み戻しが失敗してテストが落ちる = 自己検証)。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect } from 'vitest';
import {
  Output, Mp4OutputFormat, BufferTarget,
  EncodedVideoPacketSource, EncodedPacket,
  Input, BufferSource, ALL_FORMATS,
} from 'mediabunny';
import { extractMetadataFromInput } from '../media/media-metadata';

/**
 * codedWidth×codedHeight・rotation・codec を指定した最小 MP4 を生成し、
 * その解析結果 (本モジュールの core) を返す。ダミーの key パケット
 * (decoderConfig で解像度を宣言) を書き込む書き出し→読み戻しの自己検証。
 *
 * 読み側は `BufferSource` を使う: jsdom は `Blob.slice().arrayBuffer()` 未実装で
 * 本番の `BlobSource` を動かせないため。core (extractMetadataFromInput) は
 * source 種別に依存しないので、本番と同一ロジックを検証している。
 */
async function extractFromMp4(opts: {
  codedWidth: number;
  codedHeight: number;
  rotation?: 0 | 90 | 180 | 270;
  frames?: number;
  fps?: number;
  /** 明示的な提示時刻 (秒)。指定時は frames/fps より優先。 */
  timestamps?: number[];
}) {
  const { codedWidth, codedHeight, rotation = 0, fps = 30, timestamps } = opts;
  const frames = timestamps ? timestamps.length : (opts.frames ?? 1);
  const output = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const source = new EncodedVideoPacketSource('vp9');
  output.addVideoTrack(source, { rotation });
  await output.start();
  const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  for (let i = 0; i < frames; i++) {
    await source.add(
      new EncodedPacket(data, 'key', timestamps ? timestamps[i] : i / fps, 1 / fps),
      i === 0
        ? { decoderConfig: { codec: 'vp09.00.10.08', codedWidth, codedHeight } }
        : undefined
    );
  }
  await output.finalize();
  const input = new Input({
    source: new BufferSource(output.target.buffer as ArrayBuffer),
    formats: ALL_FORMATS,
  });
  return extractMetadataFromInput(input);
}

/** バイト列から直接 core を呼ぶ (失敗経路の検証用)。 */
function extractFromBytes(bytes: Uint8Array) {
  const input = new Input({ source: new BufferSource(bytes.buffer as ArrayBuffer), formats: ALL_FORMATS });
  return extractMetadataFromInput(input);
}

describe('extractVideoMetadataViaMediabunny', () => {
  it('reads coded dimensions, duration and codec from a real MP4 (jsdom, no WebCodecs)', async () => {
    const meta = await extractFromMp4({ codedWidth: 640, codedHeight: 480, frames: 3 });
    expect(meta).not.toBeNull();
    expect(meta!.codedWidth).toBe(640);
    expect(meta!.codedHeight).toBe(480);
    expect(meta!.codec).toBe('vp9');
    expect(meta!.duration).toBeGreaterThan(0);
  });

  it('REGRESSION: surfaces container rotation metadata (portrait phone video)', async () => {
    // 取り込み経路は従来 rotation を一切読まず、縦動画が横向きに表示されていた。
    const meta = await extractFromMp4({ codedWidth: 1920, codedHeight: 1080, rotation: 90 });
    expect(meta!.rotation).toBe(90);
    // coded は回転前 (1920x1080) のまま。
    expect(meta!.codedWidth).toBe(1920);
    expect(meta!.codedHeight).toBe(1080);
    // display は回転後 — 90/270 では縦横が入れ替わる。
    expect(meta!.width).toBe(1080);
    expect(meta!.height).toBe(1920);
  });

  it('does not swap display dimensions for an unrotated clip', async () => {
    const meta = await extractFromMp4({ codedWidth: 1280, codedHeight: 720, rotation: 0 });
    expect(meta!.rotation).toBe(0);
    expect(meta!.width).toBe(1280);
    expect(meta!.height).toBe(720);
  });

  it('reports a positive average frame rate for a multi-frame clip', async () => {
    const meta = await extractFromMp4({ codedWidth: 320, codedHeight: 240, frames: 10, fps: 25 });
    expect(meta!.fps).toBeGreaterThan(0);
  });

  it('returns null (not throw) for unparseable bytes so the caller can fall back', async () => {
    const meta = await extractFromBytes(new Uint8Array([0, 0, 0, 0, 1, 2, 3, 4]));
    expect(meta).toBeNull();
  });

  it('returns null for an empty blob', async () => {
    const meta = await extractFromBytes(new Uint8Array([]));
    expect(meta).toBeNull();
  });
});

// ============================================================
// フレームレート抽出の精度
// ============================================================

describe('frame rate extraction', () => {
  it('REGRESSION: reports the true rate for 30fps footage WITH DROPPED FRAMES', async () => {
    // 単純な平均パケットレートだと、落ちたフレーム分だけレートが下がって
    // 20fps と報告される (実測)。fps はタイムラインのフレーム計算に流れるため
    // (timeline/CLAUDE.md「フレーム計算は整数のみ」)、誤値は全フレームの位置を
    // ずらす。専用の computeFrameRateMetrics() は落ちがあっても格子を検出する。
    const dropped = [0, 1, 2, 3, 5, 6, 8, 9, 10, 11, 14, 15, 16, 19, 20, 21, 22, 25, 26, 29]
      .map((i) => i / 30);
    const meta = await extractFromMp4({ codedWidth: 320, codedHeight: 240, timestamps: dropped });
    expect(meta!.fps).toBe(30); // 平均パケットレートなら 20 になる
  });

  it('recovers the exact 29.97 (30000/1001) rate rather than a truncated average', async () => {
    const ts = Array.from({ length: 30 }, (_, i) => (i * 1001) / 30000);
    const meta = await extractFromMp4({ codedWidth: 320, codedHeight: 240, timestamps: ts });
    expect(meta!.fps).toBeCloseTo(30000 / 1001, 6);
  });

  it('reports a clean integer rate for uniform 30fps footage', async () => {
    const meta = await extractFromMp4({ codedWidth: 320, codedHeight: 240, frames: 20, fps: 30 });
    expect(meta!.fps).toBe(30);
  });
});
