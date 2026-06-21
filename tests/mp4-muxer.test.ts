/**
 * Tests for export/mp4-muxer.ts
 *
 * Verifies that muxMP4() produces structurally valid ISOBMFF/MP4 output:
 *  - ftyp magic ('isom' major brand)
 *  - moov box present
 *  - mdat box present with sample data
 *  - avcC present for H.264 codec
 *  - AVCC 4-byte length prefix applied to frames
 *  - Annex-B parsing helpers
 *  - Error handling
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import { muxMP4, isH264Codec, type MP4VideoTrack } from '../export/mp4-muxer';
import type { VideoChunkRef, AudioChunkRef } from '../export/webm-muxer';

// ============================================================
// Helpers
// ============================================================

/** Minimal H.264 SPS (profile=66, level=30, constraint=192) for testing. */
const MINIMAL_SPS = new Uint8Array([
  0x67, 0x42, 0xC0, 0x1E,  // NAL type=7 (SPS), profile=66, compatibility=192, level=30
  0xD9, 0x00, 0xA0, 0x47,  // SPS body (simplified, not fully valid but enough for avcC extraction)
  0xFE, 0xC8, 0x00,
]);

/** Minimal H.264 PPS for testing. */
const MINIMAL_PPS = new Uint8Array([0x68, 0xCE, 0x38, 0x80]);  // NAL type=8

/** Build a synthetic Annex-B keyframe with SPS + PPS + IDR slice. */
function makeH264Keyframe(payload: Uint8Array = new Uint8Array(8).fill(0x01)): Uint8Array {
  const idrNAL = new Uint8Array([0x65, ...payload]);  // NAL type=5 (IDR)
  const startCode4 = new Uint8Array([0x00, 0x00, 0x00, 0x01]);
  const startCode3 = new Uint8Array([0x00, 0x00, 0x01]);
  return new Uint8Array([
    ...startCode4, ...MINIMAL_SPS,
    ...startCode3, ...MINIMAL_PPS,
    ...startCode4, ...idrNAL,
  ]);
}


function fakeVideoChunk(
  timestampUs: number,
  isKeyframe: boolean,
  data: Uint8Array,
): VideoChunkRef {
  return { data, timestampUs, durationUs: 33333, isKeyframe };
}

const VP9_TRACK: MP4VideoTrack = { codec: 'vp09.00.10.08', width: 320, height: 240, fps: 30 };
const H264_TRACK: MP4VideoTrack = { codec: 'avc1.640028', width: 320, height: 240, fps: 30 };

/** Find the byte-offset of a given byte sequence or -1. */
function findBytes(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

/** Read a 4-byte big-endian uint from offset. */
function readU32BE(buf: Uint8Array, off: number): number {
  return ((buf[off] << 24) | (buf[off+1] << 16) | (buf[off+2] << 8) | buf[off+3]) >>> 0;
}

// ============================================================
// ftyp box
// ============================================================

describe('muxMP4 — ftyp', () => {
  it('output starts with ftyp box (size + "ftyp")', () => {
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, new Uint8Array(16).fill(1))]);
    expect(bytes[4]).toBe(0x66);  // 'f'
    expect(bytes[5]).toBe(0x74);  // 't'
    expect(bytes[6]).toBe(0x79);  // 'y'
    expect(bytes[7]).toBe(0x70);  // 'p'
  });

  it('ftyp major brand is "isom"', () => {
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, new Uint8Array(8).fill(1))]);
    // major brand starts at offset 8 (after 4-byte size + 4-byte 'ftyp')
    expect(String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11])).toBe('isom');
  });

  it('ftyp contains "avc1" compatible brand', () => {
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, new Uint8Array(8).fill(1))]);
    const avc1 = [0x61, 0x76, 0x63, 0x31];
    expect(findBytes(bytes, avc1)).toBeGreaterThan(-1);
  });
});

// ============================================================
// moov box
// ============================================================

describe('muxMP4 — moov', () => {
  it('moov box is present after ftyp', () => {
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, new Uint8Array(8).fill(1))]);
    const ftypSize = readU32BE(bytes, 0);
    const moovType = String.fromCharCode(...bytes.slice(ftypSize + 4, ftypSize + 8));
    expect(moovType).toBe('moov');
  });

  it('moov contains mvhd box', () => {
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, new Uint8Array(8).fill(1))]);
    const idx = findBytes(bytes, [0x6D, 0x76, 0x68, 0x64]);  // 'mvhd'
    expect(idx).toBeGreaterThan(-1);
  });

  it('moov contains trak box', () => {
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, new Uint8Array(8).fill(1))]);
    const idx = findBytes(bytes, [0x74, 0x72, 0x61, 0x6B]);  // 'trak'
    expect(idx).toBeGreaterThan(-1);
  });

  it('moov contains stbl box', () => {
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, new Uint8Array(8).fill(1))]);
    const idx = findBytes(bytes, [0x73, 0x74, 0x62, 0x6C]);  // 'stbl'
    expect(idx).toBeGreaterThan(-1);
  });
});

// ============================================================
// mdat box
// ============================================================

describe('muxMP4 — mdat', () => {
  it('mdat box is present', () => {
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, new Uint8Array(8).fill(1))]);
    const idx = findBytes(bytes, [0x6D, 0x64, 0x61, 0x74]);  // 'mdat'
    expect(idx).toBeGreaterThan(-1);
  });

  it('mdat is the last box (ends at file boundary)', () => {
    const sampleData = new Uint8Array(32).fill(0xAB);
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, sampleData)]);
    const mdatIdx = findBytes(bytes, [0x6D, 0x64, 0x61, 0x74]);
    const mdatSize = readU32BE(bytes, mdatIdx - 4);
    expect(mdatIdx - 4 + mdatSize).toBe(bytes.length);
  });

  it('mdat content includes frame data', () => {
    const sampleData = new Uint8Array([0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE]);
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, sampleData)]);
    const idx = findBytes(bytes, [0xDE, 0xAD, 0xBE, 0xEF, 0xCA, 0xFE]);
    expect(idx).toBeGreaterThan(-1);
  });
});

// ============================================================
// H.264-specific: avcC box and AVCC conversion
// ============================================================

describe('muxMP4 — H.264 avcC', () => {
  it('avcC box is present for H.264 codec', () => {
    const keyframe = makeH264Keyframe();
    const bytes = muxMP4(H264_TRACK, [fakeVideoChunk(0, true, keyframe)]);
    const idx = findBytes(bytes, [0x61, 0x76, 0x63, 0x43]);  // 'avcC'
    expect(idx).toBeGreaterThan(-1);
  });

  it('avcC configurationVersion is 1', () => {
    const keyframe = makeH264Keyframe();
    const bytes = muxMP4(H264_TRACK, [fakeVideoChunk(0, true, keyframe)]);
    const avccIdx = findBytes(bytes, [0x61, 0x76, 0x63, 0x43]);
    expect(avccIdx).toBeGreaterThan(-1);
    // avcC box: 4-byte size + 4-byte 'avcC' + body; body starts at avccIdx+4
    expect(bytes[avccIdx + 4]).toBe(1);  // configurationVersion
  });

  it('avcC AVCProfileIndication matches SPS[1]', () => {
    const keyframe = makeH264Keyframe();
    const bytes = muxMP4(H264_TRACK, [fakeVideoChunk(0, true, keyframe)]);
    const avccIdx = findBytes(bytes, [0x61, 0x76, 0x63, 0x43]);
    expect(bytes[avccIdx + 5]).toBe(MINIMAL_SPS[1]);  // profile = 0x42 (Baseline)
  });

  it('non-H.264 codec does NOT produce avcC', () => {
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, new Uint8Array(8))]);
    const idx = findBytes(bytes, [0x61, 0x76, 0x63, 0x43]);
    expect(idx).toBe(-1);
  });

  it('H.264 frame data is AVCC-converted (4-byte length prefix)', () => {
    // A simple frame with one NAL unit after startcode
    const singleNAL = new Uint8Array([0x41, 0x01, 0x02, 0x03]);  // P-slice, 4 bytes
    const frame = new Uint8Array([0x00, 0x00, 0x00, 0x01, ...singleNAL]);
    const keyframe = makeH264Keyframe();
    const bytes = muxMP4(H264_TRACK, [
      fakeVideoChunk(0, true, keyframe),
      fakeVideoChunk(33333, false, frame),
    ]);
    // In mdat, after keyframe data, the delta frame should start with 4-byte length
    // The NAL unit is 4 bytes → length prefix = 0x00 0x00 0x00 0x04
    const idx = findBytes(bytes, [0x00, 0x00, 0x00, 0x04, 0x41, 0x01, 0x02, 0x03]);
    expect(idx).toBeGreaterThan(-1);
  });
});

// ============================================================
// stco offset correctness
// ============================================================

describe('muxMP4 — stco chunk offset', () => {
  it('stco offset points to actual start of mdat content', () => {
    const sampleData = new Uint8Array(64).fill(0x77);
    const bytes = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, sampleData)]);

    // Find stco box: 'stco' = 0x73 0x74 0x63 0x6F
    const stcoIdx = findBytes(bytes, [0x73, 0x74, 0x63, 0x6F]);
    expect(stcoIdx).toBeGreaterThan(-1);
    // stco layout: 4-byte size + 4-byte 'stco' + 4-byte ver/flags + 4-byte entry_count + 4-byte offset
    const chunkOffset = readU32BE(bytes, stcoIdx + 4 + 4 + 4);  // after type+fullbox+count

    // The byte at chunkOffset should be the start of the sample data in mdat
    expect(bytes[chunkOffset]).toBe(0x77);
  });
});

// ============================================================
// Audio track
// ============================================================

describe('muxMP4 — audio', () => {
  it('adding audio track increases file size', () => {
    const video: VideoChunkRef[] = [fakeVideoChunk(0, true, new Uint8Array(32).fill(1))];
    const noAudio = muxMP4(VP9_TRACK, video);
    const audio: AudioChunkRef[] = [{ data: new Uint8Array(64).fill(0xAA), timestampUs: 0 }];
    const withAudio = muxMP4(VP9_TRACK, video, { sampleRate: 48000, channels: 2 }, audio);
    expect(withAudio.length).toBeGreaterThan(noAudio.length);
  });

  it('audio track has "soun" handler', () => {
    const video: VideoChunkRef[] = [fakeVideoChunk(0, true, new Uint8Array(32).fill(1))];
    const audio: AudioChunkRef[] = [{ data: new Uint8Array(64).fill(0xAA), timestampUs: 0 }];
    const bytes = muxMP4(VP9_TRACK, video, { sampleRate: 48000, channels: 2 }, audio);
    // 'soun' = 0x73 0x6F 0x75 0x6E
    const idx = findBytes(bytes, [0x73, 0x6F, 0x75, 0x6E]);
    expect(idx).toBeGreaterThan(-1);
  });
});

// ============================================================
// Multi-frame
// ============================================================

describe('muxMP4 — multi-frame', () => {
  it('more frames → larger output', () => {
    const single = muxMP4(VP9_TRACK, [fakeVideoChunk(0, true, new Uint8Array(32).fill(1))]);
    const multi = muxMP4(VP9_TRACK, [
      fakeVideoChunk(0, true, new Uint8Array(32).fill(1)),
      fakeVideoChunk(33333, false, new Uint8Array(16).fill(2)),
      fakeVideoChunk(66666, false, new Uint8Array(16).fill(3)),
    ]);
    expect(multi.length).toBeGreaterThan(single.length);
  });
});

// ============================================================
// Error handling
// ============================================================

describe('muxMP4 — error handling', () => {
  it('throws for empty videoChunks', () => {
    expect(() => muxMP4(VP9_TRACK, [])).toThrow('at least one video chunk');
  });
});

// ============================================================
// isH264Codec helper
// ============================================================

describe('isH264Codec', () => {
  it.each([
    ['avc1.640028', true],
    ['avc1.42E01E', true],
    ['avc3.42E01E', true],
    ['vp09.00.10.08', false],
    ['av01.0.04M.08', false],
    ['hvc1.1.6.L93.B0', false],
  ])('%s → %s', (codec, expected) => {
    expect(isH264Codec(codec)).toBe(expected);
  });
});
