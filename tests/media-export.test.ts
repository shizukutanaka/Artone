/**
 * Tests for export/media-export.ts
 *
 * Mediabunny の Conversion はパケット階層で動くため、同一コーデックのまま容器を
 * 変える transmux はデコード不要 = **jsdom で検証できる**。フィクスチャは
 * Mediabunny 自身で MP4 を書き出して使う自己検証方式 (不正なら書き出し/読み戻し
 * が落ちる)。
 *
 * jsdom は `Blob.slice().arrayBuffer()` 未実装で `BlobSource` を動かせないため、
 * 本番と同じ Conversion 経路を `BufferSource` で叩く薄いヘルパを用意している
 * (`exportMediaFile` の純粋部分 = mimeTypeFor は直接検証)。
 *
 * 区間書き出し (trim) はデコードを伴い jsdom で検証できないため、モジュール側で
 * 意図的に持っていない (詳細は export/media-export.ts の docstring 参照)。
 *
 * # AI generated (reviewed)
 */
import { describe, it, expect } from 'vitest';
import {
  Output, Mp4OutputFormat, WebMOutputFormat, BufferTarget,
  EncodedVideoPacketSource, EncodedPacket,
  Input, BufferSource, Conversion, ALL_FORMATS,
} from 'mediabunny';
import { mimeTypeFor } from '../export/media-export';
import { containerForPreset } from '../export/export-container';

/** 既知の尺/フレーム数を持つ MP4 を作る。 */
async function makeMp4(frames = 30, fps = 30): Promise<ArrayBuffer> {
  const out = new Output({ format: new Mp4OutputFormat(), target: new BufferTarget() });
  const src = new EncodedVideoPacketSource('vp9');
  out.addVideoTrack(src);
  await out.start();
  const data = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
  for (let i = 0; i < frames; i++) {
    await src.add(
      new EncodedPacket(data, 'key', i / fps, 1 / fps),
      i === 0
        ? { decoderConfig: { codec: 'vp09.00.10.08', codedWidth: 320, codedHeight: 240 } }
        : undefined
    );
  }
  await out.finalize();
  return out.target.buffer as ArrayBuffer;
}

/**
 * `exportMediaFile` と同じ Conversion 経路を、jsdom で動く BufferSource で実行する。
 * (本番は BlobSource でストリーミング。差は入力ソースのみ。)
 */
async function convert(bytes: ArrayBuffer, format: 'mp4' | 'webm') {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  const output = new Output({
    format: format === 'webm' ? new WebMOutputFormat() : new Mp4OutputFormat(),
    target: new BufferTarget(),
  });
  const conversion = await Conversion.init({ input, output });
  if (!conversion.isValid) {
    throw new Error('invalid: ' + conversion.discardedTracks.map((d) => String((d as { reason?: unknown }).reason)).join(','));
  }
  await conversion.execute();
  return output.target.buffer as ArrayBuffer;
}

/** 出力の尺を読み戻す。 */
async function durationOf(bytes: ArrayBuffer): Promise<number> {
  const input = new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS });
  return input.computeDuration();
}

describe('mimeTypeFor', () => {
  it('maps containers to their MIME type', () => {
    expect(mimeTypeFor('mp4')).toBe('video/mp4');
    expect(mimeTypeFor('webm')).toBe('video/webm');
  });
});

// ============================================================
// 実変換 (パケット階層 / デコード不要 = jsdom 可)
// ============================================================

describe('Conversion export path', () => {
  it('REGRESSION: produces a real playable file (export used to throw unconditionally)', async () => {
    // app/main.ts exportProject() は「レンダリング未接続」を理由に常に throw して
    // おり、ユーザーは1本も書き出せなかった。コンテナ変換はデコード不要なので
    // タイムライン合成を待たずに実ファイルを出せる。
    const src = await makeMp4(30, 30);
    const out = await convert(src, 'webm');
    expect(out.byteLength).toBeGreaterThan(0);
    // 出力が実際に読み戻せる = 壊れていない。
    expect(await durationOf(out)).toBeGreaterThan(0);
  });

  it('preserves the source duration to within one frame when transmuxing', async () => {
    // MP4 は各サンプルの duration を持つため尺 1.000s、Matroska/WebM は最終
    // フレームの**タイムスタンプ**が尺になるため 0.967s (= 29/30) を報告する。
    // これはコンテナ仕様の差であって欠落ではないので、1フレーム分の許容で比べる。
    const fps = 30;
    const src = await makeMp4(30, fps); // 1.0s
    const srcDuration = await durationOf(src);
    const outDuration = await durationOf(await convert(src, 'webm'));
    expect(Math.abs(srcDuration - outDuration)).toBeLessThanOrEqual(1 / fps + 1e-6);
    expect(outDuration).toBeGreaterThan(0);
  });

  it('keeps every frame: output packet count matches the source', async () => {
    // 尺の表現はコンテナ差で揺れるが、パケット (= フレーム) が失われていない
    // ことは厳密に比較できる。transmux は再エンコードしないため一致する。
    const src = await makeMp4(30, 30);
    const out = await convert(src, 'webm');
    const count = async (bytes: ArrayBuffer) => {
      const t = await new Input({ source: new BufferSource(bytes), formats: ALL_FORMATS })
        .getPrimaryVideoTrack();
      return (await t!.computePacketStats()).packetCount;
    };
    expect(await count(out)).toBe(await count(src));
  });
});

// ============================================================
// プリセット → コンテナの対応
// ============================================================

describe('containerForPreset', () => {
  it('maps the supported output formats', () => {
    expect(containerForPreset('mp4')).toBe('mp4');
    expect(containerForPreset('webm')).toBe('webm');
  });

  it('returns null for gif so the caller fails loudly instead of writing a different format', () => {
    // GIF は別経路 (export/gif-encoder.ts)。黙って mp4 を出すと、ユーザーが
    // 頼んだものと違うファイルが出てしまう。
    expect(containerForPreset('gif')).toBeNull();
  });

  it('returns null for anything unknown', () => {
    expect(containerForPreset('mov')).toBeNull();
    expect(containerForPreset('')).toBeNull();
  });

  it('covers every shipped export preset format', async () => {
    // プリセットが増えた時に、未対応形式が黙って落ちないよう対応表と突き合わせる。
    const { EXPORT_PRESETS } = await import('../export/export-engine');
    for (const preset of EXPORT_PRESETS) {
      const c = containerForPreset(preset.config.format);
      // gif のみ null が正 (別経路)。それ以外は必ず対応が付くこと。
      if (preset.config.format === 'gif') expect(c).toBeNull();
      else expect(c).not.toBeNull();
    }
  });
});
