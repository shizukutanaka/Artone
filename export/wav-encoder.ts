/**
 * Artone v3 — WAV (RIFF/WAVE) Encoder
 *
 * Float32 チャンネル列を再生可能な WAV (PCM16/PCM24/Float32) にエンコードする純関数。
 * export-engine の「ヘッダ無し生PCM」フォールバックを、実ファイルに置き換える。
 * WebCodecs 非対応環境でも音声書き出し/ステム出力を成立させる。
 *
 * 仕様: RIFF/WAVE (Microsoft). PCM(fmt=1) は整数, Float32(fmt=3) は IEEE 浮動小数。
 * @version 1.0.0
 */

export type WavBitDepth = 16 | 24 | 32;

export interface WavEncodeOptions {
  sampleRate: number;
  /** 16/24 = 整数PCM, 32 = IEEE float。既定 16。 */
  bitDepth?: WavBitDepth;
}

/** [-1,1] を指定ビット深度の整数へ (非対称フルスケール: 負は2^(n-1)、正は2^(n-1)-1)。 */
function floatToInt(sample: number, maxPos: number, minNegMagnitude: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  // s<0 のとき s*minNegMagnitude は負値 (例: -1 * 32768 = -32768)。
  return Math.round(s < 0 ? s * minNegMagnitude : s * maxPos);
}

/**
 * Float32 チャンネル列を WAV (ArrayBuffer) にエンコードする。
 * @param channels - 各チャンネルの Float32 サンプル ([-1,1])。長さは先頭 chに揃える。
 * @param options - サンプルレート / ビット深度
 */
export function encodeWAV(channels: Float32Array[], options: WavEncodeOptions): ArrayBuffer {
  const sampleRate = options.sampleRate;
  const bitDepth = options.bitDepth ?? 16;
  const numChannels = Math.max(1, channels.length);
  const numFrames = channels[0]?.length ?? 0;
  const isFloat = bitDepth === 32;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numFrames * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string): void => {
    for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
  };

  // RIFF header
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  // fmt chunk
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true); // subchunk1Size
  view.setUint16(20, isFloat ? 3 : 1, true); // audioFormat
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true); // byteRate
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  // data chunk
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  // Interleaved samples
  let offset = 44;
  for (let i = 0; i < numFrames; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = channels[ch]?.[i] ?? 0;
      if (isFloat) {
        view.setFloat32(offset, sample, true);
        offset += 4;
      } else if (bitDepth === 24) {
        const v = floatToInt(sample, 8388607, 8388608);
        view.setUint8(offset, v & 0xff);
        view.setUint8(offset + 1, (v >> 8) & 0xff);
        view.setUint8(offset + 2, (v >> 16) & 0xff);
        offset += 3;
      } else {
        view.setInt16(offset, floatToInt(sample, 32767, 32768), true);
        offset += 2;
      }
    }
  }

  return buffer;
}

/** encodeWAV の結果を audio/wav Blob で返す。 */
export function encodeWAVBlob(channels: Float32Array[], options: WavEncodeOptions): Blob {
  return new Blob([encodeWAV(channels, options)], { type: 'audio/wav' });
}
