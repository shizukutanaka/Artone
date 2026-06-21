/**
 * Tests for export/webm-muxer.ts
 *
 * Verifies that muxWebM() produces structurally valid WebM/EBML output:
 *  - EBML header magic
 *  - Segment element with unknown-size VINT
 *  - Info, Tracks, Cluster presence
 *  - SimpleBlock keyframe flag
 *  - Codec ID helpers
 *  - Error handling
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import {
  muxWebM,
  toWebMVideoCodecId,
  toWebMAudioCodecId,
  type VideoChunkRef,
  type AudioChunkRef,
  type WebMVideoTrack,
  type WebMAudioTrack,
} from '../export/webm-muxer';

// ============================================================
// Helpers
// ============================================================

function fakeVideoChunk(
  timestampUs: number,
  durationUs: number,
  isKeyframe: boolean,
  size = 64
): VideoChunkRef {
  const data = new Uint8Array(size);
  data.fill(isKeyframe ? 0x01 : 0x02);
  return { data, timestampUs, durationUs, isKeyframe };
}

function fakeAudioChunk(timestampUs: number, size = 32): AudioChunkRef {
  const data = new Uint8Array(size);
  data.fill(0xAA);
  return { data, timestampUs };
}

const VP9_TRACK: WebMVideoTrack = { codecId: 'V_VP9', width: 320, height: 240 };

/** Find the byte-offset of a given byte sequence in a Uint8Array, or -1. */
function findBytes(haystack: Uint8Array, needle: number[]): number {
  outer: for (let i = 0; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

// ============================================================
// EBML Header
// ============================================================

describe('muxWebM — EBML header', () => {
  it('starts with 4-byte EBML element ID 0x1A45DFA3', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    expect(bytes[0]).toBe(0x1A);
    expect(bytes[1]).toBe(0x45);
    expect(bytes[2]).toBe(0xDF);
    expect(bytes[3]).toBe(0xA3);
  });

  it('contains DocType string "webm"', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const webm = new TextEncoder().encode('webm');
    const idx = findBytes(bytes, Array.from(webm));
    expect(idx).toBeGreaterThan(0);
  });

  it('returns a Uint8Array', () => {
    const result = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(100);
  });
});

// ============================================================
// Segment element
// ============================================================

describe('muxWebM — Segment', () => {
  it('Segment element ID 0x18538067 is present', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const idx = findBytes(bytes, [0x18, 0x53, 0x80, 0x67]);
    expect(idx).toBeGreaterThan(0);
  });

  it('Segment uses unknown-size VINT (8 bytes 0x01FF…)', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const segIdx = findBytes(bytes, [0x18, 0x53, 0x80, 0x67]);
    expect(segIdx).toBeGreaterThan(-1);
    // Immediately after 4-byte ID, the 8-byte unknown-size VINT must begin with 0x01
    expect(bytes[segIdx + 4]).toBe(0x01);
    // Followed by 7 bytes of 0xFF
    for (let i = 0; i < 7; i++) {
      expect(bytes[segIdx + 5 + i]).toBe(0xFF);
    }
  });
});

// ============================================================
// Info element
// ============================================================

describe('muxWebM — Info', () => {
  it('Info element ID 0x1549A966 is present', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const idx = findBytes(bytes, [0x15, 0x49, 0xA9, 0x66]);
    expect(idx).toBeGreaterThan(-1);
  });

  it('contains "Artone" muxing app string', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const artone = new TextEncoder().encode('Artone');
    const idx = findBytes(bytes, Array.from(artone));
    expect(idx).toBeGreaterThan(-1);
  });
});

// ============================================================
// Tracks element
// ============================================================

describe('muxWebM — Tracks', () => {
  it('Tracks element ID 0x1654AE6B is present', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const idx = findBytes(bytes, [0x16, 0x54, 0xAE, 0x6B]);
    expect(idx).toBeGreaterThan(-1);
  });

  it('contains V_VP9 codec ID string', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const codec = new TextEncoder().encode('V_VP9');
    const idx = findBytes(bytes, Array.from(codec));
    expect(idx).toBeGreaterThan(-1);
  });

  it('contains pixel width 320 in big-endian', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    // PixelWidth element 0xB0 followed by size then value
    // 320 = 0x140, needs 2 bytes
    const pixWId = findBytes(bytes, [0xB0, 0x82, 0x01, 0x40]);
    expect(pixWId).toBeGreaterThan(-1);
  });

  it('audio TrackType byte (0x02) present when audio is supplied', () => {
    const audioTrack: WebMAudioTrack = { codecId: 'A_OPUS', sampleRate: 48000, channels: 2 };
    const bytes = muxWebM(
      VP9_TRACK,
      [fakeVideoChunk(0, 33333, true)],
      audioTrack,
      [fakeAudioChunk(0)],
    );
    // TrackType=2 (audio) encoded as element 0x83 0x81 0x02
    const idx = findBytes(bytes, [0x83, 0x81, 0x02]);
    expect(idx).toBeGreaterThan(-1);
  });
});

// ============================================================
// Cluster element
// ============================================================

describe('muxWebM — Cluster', () => {
  it('Cluster element ID 0x1F43B675 is present', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const idx = findBytes(bytes, [0x1F, 0x43, 0xB6, 0x75]);
    expect(idx).toBeGreaterThan(-1);
  });

  it('multiple keyframes that span >5 s produce multiple clusters', () => {
    const chunks: VideoChunkRef[] = [
      fakeVideoChunk(0, 33333, true),            // cluster 1 start
      fakeVideoChunk(1_000_000, 33333, false),
      fakeVideoChunk(5_100_000, 33333, true),    // >5s + keyframe → cluster 2
    ];
    const bytes = muxWebM(VP9_TRACK, chunks);
    // Count 0x1F 0x43 0xB6 0x75 occurrences
    let count = 0;
    for (let i = 0; i < bytes.length - 3; i++) {
      if (bytes[i] === 0x1F && bytes[i+1] === 0x43 && bytes[i+2] === 0xB6 && bytes[i+3] === 0x75) count++;
    }
    expect(count).toBe(2);
  });

  it('Timestamp element 0xE7 is inside Cluster', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const clusterIdx = findBytes(bytes, [0x1F, 0x43, 0xB6, 0x75]);
    expect(clusterIdx).toBeGreaterThan(-1);
    // 0xE7 appears after cluster start
    let found = false;
    for (let i = clusterIdx + 4; i < bytes.length; i++) {
      if (bytes[i] === 0xE7) { found = true; break; }
    }
    expect(found).toBe(true);
  });
});

// ============================================================
// SimpleBlock
// ============================================================

/** Parse a SimpleBlock flags byte given the index of the 0xA3 ID byte. */
function simpleBlockFlags(bytes: Uint8Array, idIdx: number): number {
  // Skip size VINT (1-4 bytes; first byte's leading bits encode length)
  const s = bytes[idIdx + 1];
  const sizeLen = (s & 0x80) ? 1 : (s & 0x40) ? 2 : (s & 0x20) ? 3 : 4;
  // SimpleBlock content: track VINT (1 byte) + timecode (2 bytes) + flags (1 byte)
  return bytes[idIdx + 1 + sizeLen + 1 + 2];
}

/** Return indices of all 0xA3 bytes that fall INSIDE a Cluster element. */
function simpleBlockIndices(bytes: Uint8Array): number[] {
  // Find the first Cluster (0x1F 0x43 0xB6 0x75) — SimpleBlocks only occur inside Clusters
  const clusterStart = findBytes(bytes, [0x1F, 0x43, 0xB6, 0x75]);
  if (clusterStart < 0) return [];
  const result: number[] = [];
  for (let i = clusterStart + 4; i < bytes.length - 6; i++) {
    if (bytes[i] === 0xA3) result.push(i);
  }
  return result;
}

describe('muxWebM — SimpleBlock', () => {
  it('at least one SimpleBlock 0xA3 is present inside a Cluster', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    expect(simpleBlockIndices(bytes).length).toBeGreaterThan(0);
  });

  it('keyframe SimpleBlock has flags byte 0x80', () => {
    const bytes = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const indices = simpleBlockIndices(bytes);
    expect(indices.length).toBeGreaterThan(0);
    expect(simpleBlockFlags(bytes, indices[0]) & 0x80).toBe(0x80);
  });

  it('delta frame SimpleBlock flags byte does NOT have bit 7 set', () => {
    const chunks: VideoChunkRef[] = [
      fakeVideoChunk(0, 33333, true),
      fakeVideoChunk(33333, 33333, false),
    ];
    const bytes = muxWebM(VP9_TRACK, chunks);
    const indices = simpleBlockIndices(bytes);
    expect(indices.length).toBeGreaterThanOrEqual(2);
    expect(simpleBlockFlags(bytes, indices[1]) & 0x80).toBe(0);
  });
});

// ============================================================
// Multi-frame size
// ============================================================

describe('muxWebM — output size', () => {
  it('more frames → larger output', () => {
    const one = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const three = muxWebM(VP9_TRACK, [
      fakeVideoChunk(0, 33333, true),
      fakeVideoChunk(33333, 33333, false),
      fakeVideoChunk(66666, 33333, false),
    ]);
    expect(three.length).toBeGreaterThan(one.length);
  });

  it('adding audio increases output size', () => {
    const noAudio = muxWebM(VP9_TRACK, [fakeVideoChunk(0, 33333, true)]);
    const withAudio = muxWebM(
      VP9_TRACK,
      [fakeVideoChunk(0, 33333, true)],
      { codecId: 'A_OPUS', sampleRate: 48000, channels: 2 },
      [fakeAudioChunk(0)],
    );
    expect(withAudio.length).toBeGreaterThan(noAudio.length);
  });
});

// ============================================================
// Error handling
// ============================================================

describe('muxWebM — error handling', () => {
  it('throws when videoChunks is empty', () => {
    expect(() => muxWebM(VP9_TRACK, [])).toThrow('at least one video chunk');
  });
});

// ============================================================
// Codec ID helpers
// ============================================================

describe('toWebMVideoCodecId', () => {
  it.each([
    ['vp09.00.10.08', 'V_VP9'],
    ['vp9', 'V_VP9'],
    ['vp08.00.10.08', 'V_VP8'],
    ['vp8', 'V_VP8'],
    ['av01.0.04M.08', 'V_AV1'],
    ['av1', 'V_AV1'],
    ['unknown', 'V_VP9'],   // fallback
  ])('%s → %s', (input, expected) => {
    expect(toWebMVideoCodecId(input)).toBe(expected);
  });
});

describe('toWebMAudioCodecId', () => {
  it.each([
    ['opus', 'A_OPUS'],
    ['vorbis', 'A_VORBIS'],
    ['mp4a.40.2', 'A_AAC'],
    ['unknown', 'A_OPUS'],  // fallback
  ])('%s → %s', (input, expected) => {
    expect(toWebMAudioCodecId(input)).toBe(expected);
  });
});
