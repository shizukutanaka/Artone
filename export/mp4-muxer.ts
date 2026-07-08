/**
 * Artone v3 — ISOBMFF/MP4 Container Muxer
 *
 * Produces valid MP4 files (ISO Base Media File Format) with H.264 video
 * and optional AAC audio from WebCodecs-encoded chunks.
 *
 * Structure: ftyp → moov (mvhd + trak[s]) → mdat
 * Two-pass approach: moov is built twice so stco offsets are exact.
 *
 * H.264 handling:
 *  - SPS/PPS extracted from the first keyframe (Annex-B 3- or 4-byte startcodes)
 *  - All frames converted Annex-B → AVCC (4-byte length-prefixed NAL units)
 *  - avcC (AVCDecoderConfigurationRecord) written inside the 'avc1' sample entry
 *
 * For non-H.264 codecs a generic visual sample entry is written; the resulting
 * file may not play in all players but conforms to the box structure spec.
 *
 * @version 1.0.0
 * # AI generated (reviewed)
 */

import type { VideoChunkRef, AudioChunkRef } from './webm-muxer';

// ============================================================
// Types
// ============================================================

export interface MP4VideoTrack {
  codec: string;    // WebCodecs codec string, e.g. 'avc1.640028'
  width: number;
  height: number;
  fps: number;
}

export interface MP4AudioTrack {
  sampleRate: number;
  channels: number;
}

// ============================================================
// ISOBMFF box helpers
// ============================================================

/** Concatenate Uint8Arrays. */
function concat(arrays: Uint8Array[]): Uint8Array {
  const total = arrays.reduce((s, a) => s + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

/** Big-endian u32. */
function u32(n: number): Uint8Array {
  return new Uint8Array([(n >>> 24) & 0xFF, (n >>> 16) & 0xFF, (n >>> 8) & 0xFF, n & 0xFF]);
}

/** Big-endian u16. */
function u16(n: number): Uint8Array {
  return new Uint8Array([(n >> 8) & 0xFF, n & 0xFF]);
}

/** 4-byte ASCII box type. */
function fourCC(s: string): Uint8Array {
  return new Uint8Array([s.charCodeAt(0), s.charCodeAt(1), s.charCodeAt(2), s.charCodeAt(3)]);
}

/** Build a box: 4-byte size + 4-byte type + body. */
function box(type: string, body: Uint8Array): Uint8Array {
  const size = 8 + body.length;
  return concat([u32(size), fourCC(type), body]);
}

/** Build a full box: 4-byte size + 4-byte type + version + 3-byte flags + body. */
function fullBox(type: string, version: number, flags: number, body: Uint8Array): Uint8Array {
  const hdr = new Uint8Array(4);
  hdr[0] = version & 0xFF;
  hdr[1] = (flags >>> 16) & 0xFF;
  hdr[2] = (flags >>> 8) & 0xFF;
  hdr[3] = flags & 0xFF;
  return box(type, concat([hdr, body]));
}

/** IEEE 754 f32 big-endian (for fixed-point 16.16 values stored as raw bytes). */
function fixed1616(n: number): Uint8Array {
  return u32(Math.round(n * 65536));
}

/** Fixed 8.8 big-endian. */
function fixed88(n: number): Uint8Array {
  return u16(Math.round(n * 256));
}

/** Null-terminated string, padded to `len` bytes. */
function paddedStr(s: string, len: number): Uint8Array {
  const out = new Uint8Array(len);
  for (let i = 0; i < s.length && i < len; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** 3×3 identity matrix for tkhd/mvhd (16.16 fixed-point, 36 bytes). */
const IDENTITY_MATRIX = new Uint8Array([
  0x00, 0x01, 0x00, 0x00,  // 1.0
  0x00, 0x00, 0x00, 0x00,  // 0
  0x00, 0x00, 0x00, 0x00,  // 0
  0x00, 0x00, 0x00, 0x00,  // 0
  0x00, 0x01, 0x00, 0x00,  // 1.0
  0x00, 0x00, 0x00, 0x00,  // 0
  0x00, 0x00, 0x00, 0x00,  // 0
  0x00, 0x00, 0x00, 0x00,  // 0
  0x40, 0x00, 0x00, 0x00,  // 16384.0 (w-scale)
]);

// ============================================================
// H.264 Annex-B parsing & AVCC conversion
// ============================================================

/** Split Annex-B bitstream into individual NAL unit byte arrays. */
function splitAnnexB(buf: Uint8Array): Uint8Array[] {
  const nalus: Uint8Array[] = [];
  let i = 0;
  const len = buf.length;

  // Find start codes (0x000001 or 0x00000001) and split
  const starts: number[] = [];
  while (i < len - 2) {
    if (buf[i] === 0 && buf[i + 1] === 0) {
      if (buf[i + 2] === 1) {
        starts.push(i + 3);
        i += 3;
        continue;
      }
      if (i + 3 < len && buf[i + 2] === 0 && buf[i + 3] === 1) {
        starts.push(i + 4);
        i += 4;
        continue;
      }
    }
    i++;
  }

  for (let j = 0; j < starts.length; j++) {
    const start = starts[j];
    const end = j + 1 < starts.length
      // Trim any trailing 0x00 0x00 bytes that were part of the start code
      ? (buf[starts[j + 1] - 4] === 0 ? starts[j + 1] - 4 : starts[j + 1] - 3)
      : len;
    if (end > start) nalus.push(buf.slice(start, end));
  }
  return nalus;
}

/** Convert Annex-B encoded frame to AVCC (4-byte length-prefixed NAL units). */
function annexBToAvcc(buf: Uint8Array): Uint8Array {
  const nalus = splitAnnexB(buf);
  const parts = nalus.map(nalu => concat([u32(nalu.length), nalu]));
  return concat(parts);
}

/** Extract SPS and PPS NAL units from the first keyframe. */
function extractSPSandPPS(keyframe: Uint8Array): { sps: Uint8Array; pps: Uint8Array } | null {
  const nalus = splitAnnexB(keyframe);
  let sps: Uint8Array | null = null;
  let pps: Uint8Array | null = null;
  for (const nalu of nalus) {
    if (nalu.length === 0) continue;
    const type = nalu[0] & 0x1F;
    if (type === 7 && !sps) sps = nalu;
    if (type === 8 && !pps) pps = nalu;
  }
  if (!sps || !pps) return null;
  return { sps, pps };
}

/** Build the avcC (AVCDecoderConfigurationRecord) box body. */
function buildAvcC(sps: Uint8Array, pps: Uint8Array): Uint8Array {
  return concat([
    new Uint8Array([
      1,         // configurationVersion
      sps[1],    // AVCProfileIndication
      sps[2],    // profile_compatibility
      sps[3],    // AVCLevelIndication
      0xFF,      // 0b11111100 | lengthSizeMinusOne(3) = 4-byte lengths
      0xE1,      // 0b11100000 | numSequenceParameterSets(1)
    ]),
    u16(sps.length),
    sps,
    new Uint8Array([0x01]),  // numPictureParameterSets
    u16(pps.length),
    pps,
  ]);
}

// ============================================================
// Box builders
// ============================================================

function buildFtyp(): Uint8Array {
  return box('ftyp', concat([
    fourCC('isom'),        // major brand
    u32(0x00000200),       // minor version
    fourCC('isom'),        // compatible brands
    fourCC('iso2'),
    fourCC('avc1'),
    fourCC('mp41'),
  ]));
}

function buildMvhd(timescale: number, durationMs: number, nextTrackId: number): Uint8Array {
  const duration = Math.round(durationMs * timescale / 1000);
  return fullBox('mvhd', 0, 0, concat([
    u32(0),            // creation_time
    u32(0),            // modification_time
    u32(timescale),
    u32(duration),
    fixed1616(1),      // rate 1.0
    fixed88(1),        // volume 1.0
    new Uint8Array(10),  // reserved
    IDENTITY_MATRIX,
    new Uint8Array(24),  // pre_defined
    u32(nextTrackId),
  ]));
}

function buildTkhd(
  trackId: number,
  durationMs: number,
  movieTimescale: number,
  width: number,
  height: number,
  isAudio: boolean,
): Uint8Array {
  const duration = Math.round(durationMs * movieTimescale / 1000);
  return fullBox('tkhd', 0, 3, concat([  // flags=3: track_enabled | track_in_movie
    u32(0),            // creation_time
    u32(0),            // modification_time
    u32(trackId),
    u32(0),            // reserved
    u32(duration),
    new Uint8Array(8), // reserved
    u16(0),            // layer
    u16(0),            // alternate_group
    isAudio ? fixed88(1) : new Uint8Array(2),  // volume
    new Uint8Array(2), // reserved
    IDENTITY_MATRIX,
    fixed1616(isAudio ? 0 : width),
    fixed1616(isAudio ? 0 : height),
  ]));
}

function buildMdhd(timescale: number, durationMs: number): Uint8Array {
  const duration = Math.round(durationMs * timescale / 1000);
  return fullBox('mdhd', 0, 0, concat([
    u32(0),         // creation_time
    u32(0),         // modification_time
    u32(timescale),
    u32(duration),
    u16(0x55C4),    // language: 'und' (undetermined)
    u16(0),         // pre_defined
  ]));
}

function buildHdlr(handlerType: 'vide' | 'soun', name: string): Uint8Array {
  return fullBox('hdlr', 0, 0, concat([
    u32(0),              // pre_defined
    fourCC(handlerType),
    u32(0), u32(0), u32(0),  // reserved
    new TextEncoder().encode(name + '\0'),
  ]));
}

function buildVmhd(): Uint8Array {
  return fullBox('vmhd', 0, 1, concat([u16(0), new Uint8Array(6)]));
}

function buildSmhd(): Uint8Array {
  return fullBox('smhd', 0, 0, concat([u16(0), u16(0)]));
}

function buildDinf(): Uint8Array {
  const url = fullBox('url ', 0, 1, new Uint8Array(0));  // self-contained
  const dref = fullBox('dref', 0, 0, concat([u32(1), url]));
  return box('dinf', dref);
}

/** Build 'avc1' visual sample entry with embedded avcC. */
function buildAvc1(width: number, height: number, sps: Uint8Array, pps: Uint8Array): Uint8Array {
  const avcCBody = buildAvcC(sps, pps);
  const avcCBox = box('avcC', avcCBody);
  return concat([
    new Uint8Array(6),   // reserved
    u16(1),              // data_reference_index
    new Uint8Array(2),   // pre_defined
    new Uint8Array(2),   // reserved
    new Uint8Array(12),  // pre_defined
    u16(width),
    u16(height),
    u32(0x00480000),     // horiz resolution 72dpi
    u32(0x00480000),     // vert resolution 72dpi
    u32(0),              // reserved
    u16(1),              // frame_count
    paddedStr('', 32),   // compressorname (empty)
    u16(0x0018),         // depth: 24 bpp
    new Uint8Array([0xFF, 0xFF]),  // pre_defined = -1 (signed i16)
    avcCBox,
  ]);
}

/**
 * Build a 2-byte AAC-LC AudioSpecificConfig (ISO/IEC 14496-3): objectType(5
 * bits, 2=AAC-LC) + samplingFreqIndex(4 bits) + channelConfig(4 bits) +
 * frameLengthFlag/dependsOnCoreCoder/extensionFlag(1 bit each, all 0).
 * Reused as-is for both the MP4 esds box below and WebM's CodecPrivate
 * element (export-engine.ts) — Matroska embeds AAC using this same
 * MPEG-4 AudioSpecificConfig per the Matroska codec spec.
 */
export function buildAacAudioSpecificConfig(sampleRate: number, channels: number): Uint8Array {
  const freqIndex = FREQ_INDEX[sampleRate] ?? 15;  // 15 = explicit frequency
  const asc = new Uint8Array(2);
  asc[0] = (2 << 3) | (freqIndex >> 1);       // AAC-LC (objectType=2)
  asc[1] = ((freqIndex & 1) << 7) | (channels << 3);
  return asc;
}

/** Build 'mp4a' audio sample entry with esds (MPEG-4 Elementary Stream Descriptor). */
function buildMp4a(sampleRate: number, channels: number): Uint8Array {
  const asc = buildAacAudioSpecificConfig(sampleRate, channels);

  // MPEG-4 Elementary Stream Descriptor (simplified ISO 14496-1)
  const esds = buildEsds(asc);
  return concat([
    new Uint8Array(6),    // reserved
    u16(1),               // data_reference_index
    new Uint8Array(8),    // reserved
    u16(channels),
    u16(16),              // sample size = 16 bits
    u16(0),               // pre_defined
    u16(0),               // reserved
    u32((sampleRate & 0xFFFF) << 16),  // sampleRate 16.16 fixed-point
    esds,
  ]);
}

const FREQ_INDEX: Record<number, number> = {
  96000: 0, 88200: 1, 64000: 2, 48000: 3, 44100: 4,
  32000: 5, 24000: 6, 22050: 7, 16000: 8, 12000: 9,
  11025: 10, 8000: 11, 7350: 12,
};

/** Build a minimal esds box for AAC. */
function buildEsds(audioSpecificConfig: Uint8Array): Uint8Array {
  // ES_Descriptor (tag=0x03)
  //   DecoderConfigDescriptor (tag=0x04)
  //     DecoderSpecificInfo (tag=0x05) ← AudioSpecificConfig
  //   SLConfigDescriptor (tag=0x06)
  function expandableClass(tag: number, body: Uint8Array): Uint8Array {
    return concat([new Uint8Array([tag, body.length]), body]);
  }

  const decoderSpecific = expandableClass(0x05, audioSpecificConfig);
  const slConfig = expandableClass(0x06, new Uint8Array([0x02]));  // predefined = 2

  const decoderConfig = expandableClass(0x04, concat([
    new Uint8Array([0x40]),  // objectTypeIndication = 0x40 (Audio ISO/IEC 14496-3)
    new Uint8Array([0x15]),  // streamType=0x05 (audio) | upStream=0 | reserved=1
    new Uint8Array([0x00, 0x00, 0x00]),  // bufferSizeDB
    u32(0),                  // maxBitrate
    u32(0),                  // avgBitrate
    decoderSpecific,
  ]));

  const esDescriptor = expandableClass(0x03, concat([
    u16(1),             // ES_ID = 1
    new Uint8Array([0x00]),  // streamPriority = 0
    decoderConfig,
    slConfig,
  ]));

  return fullBox('esds', 0, 0, esDescriptor);
}

function buildStsd(_isVideo: boolean, sampleEntry: Uint8Array, entryType: string): Uint8Array {
  const entry = box(entryType, sampleEntry);
  return fullBox('stsd', 0, 0, concat([u32(1), entry]));
}

/**
 * Build stts (time-to-sample) for constant frame rate.
 * sample_count frames each with delta = timescale/fps ticks.
 */
function buildStts(sampleCount: number, sampleDelta: number): Uint8Array {
  return fullBox('stts', 0, 0, concat([u32(1), u32(sampleCount), u32(sampleDelta)]));
}

/**
 * Build stts from a per-sample list of deltas (audio-timescale ticks), run-
 * length-encoding consecutive equal deltas into single entries. Unlike
 * buildStts's fixed single-entry form, this correctly represents the final
 * chunk of a track whose sample count isn't an exact multiple of the frame
 * size (true for virtually any real-world audio buffer) instead of
 * overstating the track's total duration.
 */
function buildSttsVariable(sampleDeltas: number[]): Uint8Array {
  const entries: Array<{ count: number; delta: number }> = [];
  for (const delta of sampleDeltas) {
    const last = entries[entries.length - 1];
    if (last && last.delta === delta) {
      last.count++;
    } else {
      entries.push({ count: 1, delta });
    }
  }
  return fullBox('stts', 0, 0, concat([
    u32(entries.length),
    concat(entries.map((e) => concat([u32(e.count), u32(e.delta)]))),
  ]));
}

/** Build stss (sync sample table) — indices of keyframe samples (1-based). */
function buildStss(keyframeIndices: number[]): Uint8Array {
  const entries = concat(keyframeIndices.map(i => u32(i)));
  return fullBox('stss', 0, 0, concat([u32(keyframeIndices.length), entries]));
}

/** Build stsc (sample-to-chunk): all samples in one chunk. */
function buildStsc(samplesPerChunk: number): Uint8Array {
  return fullBox('stsc', 0, 0, concat([u32(1), u32(1), u32(samplesPerChunk), u32(1)]));
}

/** Build stsz (sample size): individual sizes for each sample. */
function buildStsz(sizes: number[]): Uint8Array {
  return fullBox('stsz', 0, 0, concat([
    u32(0),             // sample_size = 0 (variable)
    u32(sizes.length),
    concat(sizes.map(s => u32(s))),
  ]));
}

/** Build stco (chunk offset): single absolute byte offset into mdat content. */
function buildStco(chunkOffset: number): Uint8Array {
  return fullBox('stco', 0, 0, concat([u32(1), u32(chunkOffset)]));
}

// ============================================================
// Main track builders
// ============================================================

function buildVideoStbl(
  sampleCount: number,
  timescale: number,
  fps: number,
  sampleSizes: number[],
  keyframeIndices: number[],
  stsdEntry: Uint8Array,
  entryType: string,
  chunkOffset: number,
): Uint8Array {
  // fps=0 → timescale=0 → 0/0 = NaN → u32(NaN)=0 → all stts deltas zero → corrupt MP4.
  if (!(fps > 0)) throw new RangeError(`buildVideoStbl: fps must be > 0, got ${fps}`);
  const sampleDelta = Math.round(timescale / fps);
  return box('stbl', concat([
    buildStsd(true, stsdEntry, entryType),
    buildStts(sampleCount, sampleDelta),
    buildStss(keyframeIndices),
    buildStsc(sampleCount),
    buildStsz(sampleSizes),
    buildStco(chunkOffset),
  ]));
}

function buildAudioStbl(
  sampleCount: number,
  sampleSizes: number[],
  sampleDeltas: number[],
  sampleEntry: Uint8Array,
  chunkOffset: number,
): Uint8Array {
  return box('stbl', concat([
    buildStsd(false, sampleEntry, 'mp4a'),
    buildSttsVariable(sampleDeltas),
    buildStsc(sampleCount),
    buildStsz(sampleSizes),
    buildStco(chunkOffset),
  ]));
}

function buildVideoTrak(
  durationMs: number,
  movieTimescale: number,
  videoTrack: MP4VideoTrack,
  sampleSizes: number[],
  keyframeIndices: number[],
  stsdEntry: Uint8Array,
  entryType: string,
  chunkOffset: number,
): Uint8Array {
  const mediaTimescale = Math.round(videoTrack.fps * 1000);  // e.g., 30000 for 30fps
  const stbl = buildVideoStbl(
    sampleSizes.length, mediaTimescale, videoTrack.fps,
    sampleSizes, keyframeIndices, stsdEntry, entryType, chunkOffset,
  );
  const minf = box('minf', concat([buildVmhd(), buildDinf(), stbl]));
  const mdia = box('mdia', concat([
    buildMdhd(mediaTimescale, durationMs),
    buildHdlr('vide', 'VideoHandler'),
    minf,
  ]));
  return box('trak', concat([
    buildTkhd(1, durationMs, movieTimescale, videoTrack.width, videoTrack.height, false),
    mdia,
  ]));
}

function buildAudioTrak(
  durationMs: number,
  movieTimescale: number,
  audioTrack: MP4AudioTrack,
  sampleSizes: number[],
  sampleDeltas: number[],
  chunkOffset: number,
): Uint8Array {
  const sampleEntry = buildMp4a(audioTrack.sampleRate, audioTrack.channels);
  const stbl = buildAudioStbl(sampleSizes.length, sampleSizes, sampleDeltas, sampleEntry, chunkOffset);
  const minf = box('minf', concat([buildSmhd(), buildDinf(), stbl]));
  const mdia = box('mdia', concat([
    buildMdhd(audioTrack.sampleRate, durationMs),
    buildHdlr('soun', 'SoundHandler'),
    minf,
  ]));
  return box('trak', concat([
    buildTkhd(2, durationMs, movieTimescale, 0, 0, true),
    mdia,
  ]));
}

// ============================================================
// Public API
// ============================================================

/**
 * Mux H.264 (or other codec) video chunks and optional AAC audio into an MP4 file.
 *
 * @param videoTrack  - codec string, width, height, fps
 * @param videoChunks - encoded video frames with timestamps
 * @param audioTrack  - optional audio track descriptor
 * @param audioChunks - optional per-frame encoded audio chunks
 * @returns complete MP4 file as Uint8Array
 */
export function muxMP4(
  videoTrack: MP4VideoTrack,
  videoChunks: VideoChunkRef[],
  audioTrack?: MP4AudioTrack,
  audioChunks?: AudioChunkRef[],
): Uint8Array {
  if (videoChunks.length === 0) {
    throw new Error('muxMP4: at least one video chunk is required');
  }

  const hasAudio = !!(audioTrack && audioChunks && audioChunks.length > 0);
  const lastVideo = videoChunks[videoChunks.length - 1];
  const durationMs = (lastVideo.timestampUs + lastVideo.durationUs) / 1000;
  const movieTimescale = 1000;  // ms precision at movie level

  // Determine video codec entry type and prepare AVCC if H.264
  const isH264 = videoTrack.codec.startsWith('avc1') || videoTrack.codec.startsWith('avc3');
  let videoStsdEntry: Uint8Array;
  let videoEntryType: string;
  let convertedVideoFrames: Uint8Array[];

  if (isH264) {
    // Extract SPS/PPS from first keyframe
    const firstKey = videoChunks.find(c => c.isKeyframe);
    const spsPps = firstKey ? extractSPSandPPS(firstKey.data) : null;
    if (!spsPps) {
      // Fallback: treat as generic if SPS/PPS not found
      videoStsdEntry = concat([new Uint8Array(6), u16(1)]);
      videoEntryType = 'avc1';
      convertedVideoFrames = videoChunks.map(c => c.data);
    } else {
      videoStsdEntry = buildAvc1(videoTrack.width, videoTrack.height, spsPps.sps, spsPps.pps);
      videoEntryType = 'avc1';
      // Convert all frames from Annex-B to AVCC
      convertedVideoFrames = videoChunks.map(c => annexBToAvcc(c.data));
    }
  } else {
    // Generic visual sample entry for VP9, HEVC, AV1 (basic structure only)
    videoStsdEntry = concat([new Uint8Array(6), u16(1), new Uint8Array(70)]);
    videoEntryType = videoTrack.codec.startsWith('hvc1') ? 'hvc1'
      : videoTrack.codec.startsWith('av01') ? 'av01'
      : 'avc1';
    convertedVideoFrames = videoChunks.map(c => c.data);
  }

  const videoSizes = convertedVideoFrames.map(f => f.length);
  const keyframeIndices = videoChunks
    .map((c, i) => c.isKeyframe ? i + 1 : -1)
    .filter(i => i > 0);

  const audioFrames = hasAudio ? audioChunks!.map(c => c.data) : [];
  const audioSizes = audioFrames.map(f => f.length);
  // Per-chunk delta in audio-timescale (sample rate) ticks, derived from each
  // chunk's actual encoded duration — not assumed to be a constant 1024
  // samples, which overstated the track's total duration whenever the
  // sample count wasn't an exact multiple of the encoder's frame size.
  const audioSampleDeltas = hasAudio
    ? audioChunks!.map(c => Math.round((c.durationUs * audioTrack!.sampleRate) / 1_000_000))
    : [];

  const ftyp = buildFtyp();

  // Two-pass moov building: first with placeholder offsets, then with exact offsets.
  function buildMoov(videoChunkOffset: number, audioChunkOffset: number): Uint8Array {
    const videoTrak = buildVideoTrak(
      durationMs, movieTimescale, videoTrack,
      videoSizes, keyframeIndices, videoStsdEntry, videoEntryType, videoChunkOffset,
    );
    const parts: Uint8Array[] = [
      buildMvhd(movieTimescale, durationMs, hasAudio ? 3 : 2),
      videoTrak,
    ];
    if (hasAudio) {
      parts.push(buildAudioTrak(durationMs, movieTimescale, audioTrack!, audioSizes, audioSampleDeltas, audioChunkOffset));
    }
    return box('moov', concat(parts));
  }

  // Pass 1: build with 0 offsets to determine moov size
  const moovPass1 = buildMoov(0, 0);
  const mdatHeaderSize = 8;  // 4-byte size + 4-byte 'mdat'
  const videoDataStart = ftyp.length + moovPass1.length + mdatHeaderSize;
  const videoDataTotal = videoSizes.reduce((s, n) => s + n, 0);
  const audioDataStart = videoDataStart + videoDataTotal;

  // Pass 2: build moov with exact offsets
  const moov = buildMoov(videoDataStart, audioDataStart);

  // Build mdat box
  const allFrameData = concat([
    concat(convertedVideoFrames),
    ...audioFrames,
  ]);
  const mdat = box('mdat', allFrameData);

  return concat([ftyp, moov, mdat]);
}

// ============================================================
// Codec helpers (re-export for use in export-engine)
// ============================================================

/** True if the WebCodecs codec string requires H.264 AVCC processing. */
export function isH264Codec(codec: string): boolean {
  return codec.startsWith('avc1') || codec.startsWith('avc3');
}
