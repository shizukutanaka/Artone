/**
 * Artone v3 — WebM Container Muxer (EBML/Matroska)
 *
 * Produces valid WebM files from VP8/VP9/AV1 video chunks and optional
 * A_OPUS / A_AAC audio chunks obtained from the WebCodecs API.
 *
 * TimestampScale = 1,000,000 ns/unit → all timecodes are in milliseconds.
 * Segment element uses "unknown" size for streaming compatibility.
 * Clusters span ≤5 s, each starting on a video keyframe.
 *
 * @version 1.0.0
 * # AI generated (reviewed)
 */

// ============================================================
// Public types
// ============================================================

/** A single encoded video frame extracted from a WebCodecs EncodedVideoChunk. */
export interface VideoChunkRef {
  data: Uint8Array;
  timestampUs: number;   // presentation timestamp, microseconds
  durationUs: number;    // frame duration, microseconds
  isKeyframe: boolean;
}

/** A single encoded audio frame with its presentation timestamp. */
export interface AudioChunkRef {
  data: Uint8Array;
  timestampUs: number;   // presentation timestamp, microseconds
  durationUs: number;    // frame duration, microseconds
}

/** Video track parameters for the WebM Tracks block. */
export interface WebMVideoTrack {
  codecId: string;   // 'V_VP8' | 'V_VP9' | 'V_AV1'
  width: number;
  height: number;
}

/** Audio track parameters for the WebM Tracks block. */
export interface WebMAudioTrack {
  codecId: string;       // 'A_OPUS' | 'A_VORBIS' | 'A_AAC'
  sampleRate: number;
  channels: number;
  codecPrivate?: Uint8Array;
}

// ============================================================
// EBML element IDs  (raw bytes; written verbatim per spec)
// ============================================================

const ID = {
  // 4-byte (Level-0 / Level-1)
  EBML:              [0x1A, 0x45, 0xDF, 0xA3],
  Segment:           [0x18, 0x53, 0x80, 0x67],
  Info:              [0x15, 0x49, 0xA9, 0x66],
  Tracks:            [0x16, 0x54, 0xAE, 0x6B],
  Cluster:           [0x1F, 0x43, 0xB6, 0x75],

  // 3-byte
  TimestampScale:    [0x2A, 0xD7, 0xB1],

  // 2-byte
  EBMLVersion:       [0x42, 0x86],
  EBMLReadVersion:   [0x42, 0xF7],
  EBMLMaxIDLength:   [0x42, 0xF2],
  EBMLMaxSizeLength: [0x42, 0xF3],
  DocType:           [0x42, 0x82],
  DocTypeVersion:    [0x42, 0x87],
  DocTypeReadVer:    [0x42, 0x85],
  Duration:          [0x44, 0x89],
  MuxingApp:         [0x4D, 0x80],
  WritingApp:        [0x57, 0x41],
  TrackUID:          [0x73, 0xC5],
  CodecPrivate:      [0x63, 0xA2],

  // 1-byte
  TrackEntry:        [0xAE],
  TrackNumber:       [0xD7],
  TrackType:         [0x83],
  CodecID:           [0x86],
  Video:             [0xE0],
  PixelWidth:        [0xB0],
  PixelHeight:       [0xBA],
  Audio:             [0xE1],
  SamplingFrequency: [0xB5],
  Channels:          [0x9F],
  Timestamp:         [0xE7],
  SimpleBlock:       [0xA3],
} as const satisfies Record<string, number[]>;

// ============================================================
// EBML binary helpers
// ============================================================

/** Concatenate Uint8Arrays into a single new Uint8Array. */
function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

/**
 * Encode a data-size VINT (EBML variable-length integer for element sizes).
 * Supports sizes up to ~34 GB via 5-byte encoding; above that uses 8-byte.
 */
function sizeVint(n: number): Uint8Array {
  if (n < 0x7F)
    {return new Uint8Array([0x80 | n]);}
  if (n < 0x3FFF)
    {return new Uint8Array([0x40 | (n >> 8), n & 0xFF]);}
  if (n < 0x1FFFFF)
    {return new Uint8Array([0x20 | (n >> 16), (n >> 8) & 0xFF, n & 0xFF]);}
  if (n < 0x0FFFFFFF)
    {return new Uint8Array([0x10 | (n >>> 24), (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF]);}
  // 5-byte for up to ~34 GB
  if (n < 0x7FFFFFFFF) {
    const hi = Math.floor(n / 0x100000000);
    const lo = n >>> 0;
    return new Uint8Array([0x08 | (hi & 0x07), (lo >>> 24) & 0xFF, (lo >>> 16) & 0xFF, (lo >>> 8) & 0xFF, lo & 0xFF]);
  }
  // 8-byte fallback (handles any JS-safe integer)
  const buf = new Uint8Array(8);
  buf[0] = 0x01;
  let v = n;
  for (let i = 7; i >= 1; i--) { buf[i] = v & 0xFF; v = Math.floor(v / 256); }
  return buf;
}

/** 8-byte "unknown" VINT for segment element (streaming-compatible). */
const UNKNOWN_SIZE = new Uint8Array([0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF]);

/** Build one EBML element: id + sizeVint(data.length) + data. */
function el(id: readonly number[], data: Uint8Array): Uint8Array {
  return concat([new Uint8Array(id), sizeVint(data.length), data]);
}

/** Build an EBML element with unknown size (used for Segment). */
function elUnknown(id: readonly number[], data: Uint8Array): Uint8Array {
  return concat([new Uint8Array(id), UNKNOWN_SIZE, data]);
}

/** Encode unsigned integer, minimal bytes, big-endian (at least 1 byte). */
function uInt(n: number): Uint8Array {
  if (n === 0) return new Uint8Array([0]);
  const bytes: number[] = [];
  let v = n >>> 0;
  while (v > 0) { bytes.unshift(v & 0xFF); v >>>= 8; }
  return new Uint8Array(bytes);
}

/** Encode IEEE 754 double-precision float, big-endian (8 bytes). */
function f64(n: number): Uint8Array {
  const buf = new ArrayBuffer(8);
  new DataView(buf).setFloat64(0, n, false);
  return new Uint8Array(buf);
}

/** Encode ASCII/UTF-8 string. */
function str(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

/** EBML data VINT for track number in a SimpleBlock header. */
function trackNumVint(n: number): Uint8Array {
  if (n < 127) return new Uint8Array([0x80 | n]);
  return new Uint8Array([0x40 | (n >> 8), n & 0xFF]);
}

// ============================================================
// WebM structure builders
// ============================================================

function buildEBMLHeader(): Uint8Array {
  return el(ID.EBML, concat([
    el(ID.EBMLVersion,       uInt(1)),
    el(ID.EBMLReadVersion,   uInt(1)),
    el(ID.EBMLMaxIDLength,   uInt(4)),
    el(ID.EBMLMaxSizeLength, uInt(8)),
    el(ID.DocType,           str('webm')),
    el(ID.DocTypeVersion,    uInt(4)),
    el(ID.DocTypeReadVer,    uInt(2)),
  ]));
}

function buildInfo(durationMs: number): Uint8Array {
  return el(ID.Info, concat([
    el(ID.TimestampScale, uInt(1_000_000)),   // 1 ms per timecode unit
    el(ID.Duration,       f64(durationMs)),
    el(ID.MuxingApp,      str('Artone')),
    el(ID.WritingApp,     str('Artone')),
  ]));
}

function buildVideoTrackEntry(track: WebMVideoTrack): Uint8Array {
  return el(ID.TrackEntry, concat([
    el(ID.TrackNumber, uInt(1)),
    el(ID.TrackUID,    uInt(1)),
    el(ID.TrackType,   uInt(1)),                // 1 = video
    el(ID.CodecID,     str(track.codecId)),
    el(ID.Video, concat([
      el(ID.PixelWidth,  uInt(track.width)),
      el(ID.PixelHeight, uInt(track.height)),
    ])),
  ]));
}

function buildAudioTrackEntry(track: WebMAudioTrack, trackNum: number): Uint8Array {
  const parts: Uint8Array[] = [
    el(ID.TrackNumber, uInt(trackNum)),
    el(ID.TrackUID,    uInt(trackNum)),
    el(ID.TrackType,   uInt(2)),                // 2 = audio
    el(ID.CodecID,     str(track.codecId)),
    el(ID.Audio, concat([
      el(ID.SamplingFrequency, f64(track.sampleRate)),
      el(ID.Channels,          uInt(track.channels)),
    ])),
  ];
  if (track.codecPrivate) {
    parts.push(el(ID.CodecPrivate, track.codecPrivate));
  }
  return el(ID.TrackEntry, concat(parts));
}

function buildSimpleBlock(
  trackNum: number,
  relativeMs: number,
  isKeyframe: boolean,
  data: Uint8Array,
): Uint8Array {
  // Relative timestamp: signed 16-bit big-endian
  const ts = Math.round(relativeMs);
  const tsClamped = Math.max(-32768, Math.min(32767, ts));
  const tsU = tsClamped < 0 ? tsClamped + 65536 : tsClamped;

  const tn = trackNumVint(trackNum);
  const hdr = new Uint8Array(tn.length + 3);
  hdr.set(tn, 0);
  hdr[tn.length]     = (tsU >> 8) & 0xFF;
  hdr[tn.length + 1] = tsU & 0xFF;
  hdr[tn.length + 2] = isKeyframe ? 0x80 : 0x00;  // flags: bit 7 = keyframe

  return el(ID.SimpleBlock, concat([hdr, data]));
}

interface RawBlock {
  trackNum: number;
  timestampMs: number;
  isKeyframe: boolean;
  data: Uint8Array;
}

function buildCluster(startMs: number, blocks: RawBlock[]): Uint8Array {
  const parts: Uint8Array[] = [el(ID.Timestamp, uInt(Math.round(startMs)))];
  for (const b of blocks) {
    const rel = b.timestampMs - startMs;
    if (rel < 0 || rel > 32767) continue;  // should not happen with proper partitioning
    parts.push(buildSimpleBlock(b.trackNum, rel, b.isKeyframe, b.data));
  }
  return el(ID.Cluster, concat(parts));
}

// ============================================================
// Public API
// ============================================================

/**
 * Mux VP8/VP9/AV1 video chunks (and optional audio chunks) into a WebM file.
 *
 * @param videoTrack  - codec, dimensions
 * @param videoChunks - encoded video frames with timestamps
 * @param audioTrack  - optional audio track descriptor
 * @param audioChunks - optional per-frame encoded audio with timestamps
 * @returns complete WebM file as Uint8Array
 */
export function muxWebM(
  videoTrack: WebMVideoTrack,
  videoChunks: VideoChunkRef[],
  audioTrack?: WebMAudioTrack,
  audioChunks?: AudioChunkRef[],
): Uint8Array {
  if (videoChunks.length === 0) {
    throw new Error('muxWebM: at least one video chunk is required');
  }

  const hasAudio = !!(audioTrack && audioChunks && audioChunks.length > 0);

  // Duration: last video frame end time in ms
  const lastVideo = videoChunks[videoChunks.length - 1];
  const durationMs = (lastVideo.timestampUs + lastVideo.durationUs) / 1000;

  // Build Tracks element
  const trackEls: Uint8Array[] = [buildVideoTrackEntry(videoTrack)];
  if (hasAudio) trackEls.push(buildAudioTrackEntry(audioTrack!, 2));
  const tracksEl = el(ID.Tracks, concat(trackEls));

  // Collect all blocks, sort by presentation timestamp
  const allBlocks: RawBlock[] = videoChunks.map(c => ({
    trackNum: 1,
    timestampMs: c.timestampUs / 1000,
    isKeyframe: c.isKeyframe,
    data: c.data,
  }));
  if (hasAudio) {
    for (const a of audioChunks!) {
      allBlocks.push({
        trackNum: 2,
        timestampMs: a.timestampUs / 1000,
        isKeyframe: true,   // audio frames are always "random access"
        data: a.data,
      });
    }
  }
  allBlocks.sort((a, b) => a.timestampMs - b.timestampMs);

  // Partition into clusters: ≤5 s per cluster, always start on video keyframe
  const CLUSTER_MAX_MS = 5000;
  const clusters: Uint8Array[] = [];
  let clusterStart = allBlocks[0]?.timestampMs ?? 0;
  let bucket: RawBlock[] = [];

  for (const block of allBlocks) {
    const spanMs = block.timestampMs - clusterStart;
    const startNewCluster =
      bucket.length > 0 &&
      spanMs >= CLUSTER_MAX_MS &&
      block.isKeyframe &&
      block.trackNum === 1;

    if (startNewCluster) {
      clusters.push(buildCluster(clusterStart, bucket));
      clusterStart = block.timestampMs;
      bucket = [];
    }
    bucket.push(block);
  }
  if (bucket.length > 0) clusters.push(buildCluster(clusterStart, bucket));

  // Assemble segment body
  const segmentBody = concat([
    buildInfo(durationMs),
    tracksEl,
    ...clusters,
  ]);

  return concat([buildEBMLHeader(), elUnknown(ID.Segment, segmentBody)]);
}

// ============================================================
// Codec ID helpers
// ============================================================

/**
 * Map a WebCodecs video codec string (e.g. 'vp09.00.10.08') to the
 * corresponding WebM CodecID string (e.g. 'V_VP9').
 */
export function toWebMVideoCodecId(codec: string): string {
  const c = codec.toLowerCase();
  if (c.startsWith('vp09') || c.startsWith('vp9')) return 'V_VP9';
  if (c.startsWith('vp08') || c.startsWith('vp8')) return 'V_VP8';
  if (c.startsWith('av01') || c.startsWith('av1')) return 'V_AV1';
  return 'V_VP9';
}

/**
 * Map a WebCodecs audio codec string (e.g. 'mp4a.40.2') to the
 * corresponding WebM CodecID string (e.g. 'A_AAC').
 */
export function toWebMAudioCodecId(codec: string): string {
  const c = codec.toLowerCase();
  if (c.startsWith('opus')) return 'A_OPUS';
  if (c.startsWith('vorbis')) return 'A_VORBIS';
  if (c.startsWith('mp4a')) return 'A_AAC';
  return 'A_OPUS';
}
