/**
 * Artone v3 — WebCodecs Video Pipeline
 * 
 * ハードウェアアクセラレーテッド動画処理
 * - VideoDecoder/VideoEncoder
 * - H.264/H.265/VP9/AV1 対応
 * - TransformStream ベース
 * - Frame-accurate seeking
 * - Zero-copy GPU processing
 * 
 * @version 1.0.0
 * @license MIT
 */

import { createLogger } from '../app/logger';
import { setHighQualityScaling } from '../app/utils';

// ============================================================
// Types
// ============================================================

const log = createLogger('WebCodecs');

export interface CodecConfig {
  codec: string;
  width: number;
  height: number;
  bitrate?: number;
  framerate?: number;
  hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
}

export interface DecodedFrame {
  frame: VideoFrame;
  index: number;
  timestamp: number;
  duration: number;
  keyFrame: boolean;
}

export interface EncodedChunk {
  chunk: EncodedVideoChunk;
  index: number;
  timestamp: number;
  keyFrame: boolean;
}

export interface PipelineStats {
  decodedFrames: number;
  encodedFrames: number;
  droppedFrames: number;
  avgDecodeTime: number;
  avgEncodeTime: number;
  queueSize: number;
}

export type FrameProcessor = (frame: VideoFrame, index: number) => VideoFrame | Promise<VideoFrame>;

// ============================================================
// Supported Codecs
// ============================================================

export const SUPPORTED_CODECS = {
  h264: {
    decode: ['avc1.42001E', 'avc1.4D001E', 'avc1.64001E'],
    encode: ['avc1.42001E', 'avc1.4D0028', 'avc1.640028']
  },
  h265: {
    decode: ['hev1.1.6.L93.B0', 'hvc1.1.6.L93.B0'],
    encode: ['hev1.1.6.L93.B0']
  },
  vp9: {
    decode: ['vp09.00.10.08', 'vp09.02.10.10.01.09.16.09.01'],
    encode: ['vp09.00.10.08']
  },
  av1: {
    decode: ['av01.0.04M.08', 'av01.0.08M.10'],
    encode: ['av01.0.04M.08']
  }
} as const;

// ============================================================
// Codec Support Detection
// ============================================================

export async function checkCodecSupport(codec: string, type: 'decode' | 'encode'): Promise<boolean> {
  try {
    if (type === 'decode') {
      const result = await VideoDecoder.isConfigSupported({ codec });
      return result.supported ?? false;
    } else {
      const result = await VideoEncoder.isConfigSupported({
        codec,
        width: 1920,
        height: 1080,
        bitrate: 5_000_000,
        framerate: 30
      });
      return result.supported ?? false;
    }
  } catch {
    return false;
  }
}

export async function getBestCodec(
  type: 'decode' | 'encode',
  preference: 'h264' | 'h265' | 'vp9' | 'av1' = 'h264'
): Promise<string | null> {
  const codecs = SUPPORTED_CODECS[preference][type];
  
  for (const codec of codecs) {
    if (await checkCodecSupport(codec, type)) {
      return codec;
    }
  }
  
  // Fallback to other codecs
  for (const [, codecSet] of Object.entries(SUPPORTED_CODECS)) {
    for (const codec of codecSet[type]) {
      if (await checkCodecSupport(codec, type)) {
        return codec;
      }
    }
  }
  
  return null;
}

// ============================================================
// Video Decoder Stream
// ============================================================

export class VideoDecoderStream extends TransformStream<EncodedVideoChunk, DecodedFrame> {
  private decoder: VideoDecoder | null = null;

  constructor(config: VideoDecoderConfig) {
    // Definite assignment: start() sets `decoder` synchronously inside super().
    let decoder!: VideoDecoder;
    let frameIndex = 0;
    const pendingResolves: Array<(frame: DecodedFrame) => void> = [];

    super({
      start: (controller) => {
        decoder = new VideoDecoder({
          output: (frame) => {
            const resolve = pendingResolves.shift();
            if (resolve) {
              resolve({
                frame,
                index: frameIndex++,
                timestamp: frame.timestamp,
                duration: frame.duration ?? 0,
                keyFrame: false
              });
            } else {
              controller.enqueue({
                frame,
                index: frameIndex++,
                timestamp: frame.timestamp,
                duration: frame.duration ?? 0,
                keyFrame: false
              });
            }
          },
          error: (e) => controller.error(e)
        });
        decoder.configure(config);
      },

      transform: async (chunk, controller) => {
        return new Promise((resolve) => {
          pendingResolves.push((decodedFrame) => {
            controller.enqueue(decodedFrame);
            resolve();
          });
          decoder.decode(chunk);
        });
      },

      flush: async () => {
        await decoder.flush();
        decoder.close();
      }
    });

    // start() runs synchronously inside super(), so `decoder` is initialized
    // here. It cannot be assigned to `this` from within start() — `this` is
    // not yet available before super() returns.
    this.decoder = decoder;
  }

  getDecoder(): VideoDecoder | null {
    return this.decoder;
  }
}

// ============================================================
// Video Encoder Stream
// ============================================================

export class VideoEncoderStream extends TransformStream<VideoFrame, EncodedChunk> {
  private encoder: VideoEncoder | null = null;

  constructor(config: VideoEncoderConfig) {
    // Definite assignment: start() sets `encoder` synchronously inside super().
    let encoder!: VideoEncoder;
    let chunkIndex = 0;
    const keyFrameInterval = 30;
    let frameCount = 0;

    super({
      start: (controller) => {
        encoder = new VideoEncoder({
          output: (chunk, _metadata) => {
            controller.enqueue({
              chunk,
              index: chunkIndex++,
              timestamp: chunk.timestamp,
              keyFrame: chunk.type === 'key'
            });
          },
          error: (e) => controller.error(e)
        });
        encoder.configure(config);
      },

      transform: (frame, _controller) => {
        const isKeyFrame = frameCount % keyFrameInterval === 0;
        try {
          encoder.encode(frame, { keyFrame: isKeyFrame });
        } finally {
          // encoder.encode() can throw synchronously (e.g. encoder in
          // 'closed' state) — without finally, frame.close() never runs
          // and the VideoFrame leaks per core/CLAUDE.md's use-after-close rule.
          frame.close();
        }
        frameCount++;
      },

      flush: async () => {
        await encoder.flush();
        encoder.close();
      }
    });

    // See VideoDecoderStream: assign after super() since start() (which sets
    // `encoder`) runs synchronously during construction.
    this.encoder = encoder;
  }

  getEncoder(): VideoEncoder | null {
    return this.encoder;
  }
}

// ============================================================
// Frame Processing Stream
// ============================================================

export class FrameProcessorStream extends TransformStream<DecodedFrame, DecodedFrame> {
  constructor(processor: FrameProcessor) {
    super({
      transform: async (item, controller) => {
        try {
          const processedFrame = await processor(item.frame, item.index);
          
          // If processor returns the same frame, don't close it
          if (processedFrame !== item.frame) {
            item.frame.close();
          }
          
          controller.enqueue({
            ...item,
            frame: processedFrame
          });
        } catch (error) {
          item.frame.close();
          controller.error(error);
        }
      }
    });
  }
}

// ============================================================
// Video Pipeline
// ============================================================

/**
 * Close a decoder/encoder without throwing if it is already closed.
 *
 * Batch decode/encode must always release the underlying codec — even on the
 * error path — to avoid leaking the (often hardware-backed) instance. close()
 * throws in some states, so guard on `state` and swallow races.
 */
function closeQuietly(codec: VideoDecoder | VideoEncoder): void {
  try {
    if (codec.state !== 'closed') codec.close();
  } catch {
    // Already closing/closed — nothing left to release.
  }
}

export class VideoPipeline {
  private decoderConfig: VideoDecoderConfig | null = null;
  private encoderConfig: VideoEncoderConfig | null = null;
  private processors: FrameProcessor[] = [];
  private stats: PipelineStats = {
    decodedFrames: 0,
    encodedFrames: 0,
    droppedFrames: 0,
    avgDecodeTime: 0,
    avgEncodeTime: 0,
    queueSize: 0
  };

  constructor() {}

  // ============================================================
  // Configuration
  // ============================================================

  async configureDecoder(config: Partial<VideoDecoderConfig> & { codec: string }): Promise<boolean> {
    const fullConfig: VideoDecoderConfig = {
      codedWidth: config.codedWidth ?? 1920,
      codedHeight: config.codedHeight ?? 1080,
      hardwareAcceleration: config.hardwareAcceleration ?? 'prefer-hardware',
      ...config
    };

    const support = await VideoDecoder.isConfigSupported(fullConfig);
    if (!support.supported) {
      log.warn('Decoder config not supported:', fullConfig);
      return false;
    }

    this.decoderConfig = support.config!;
    return true;
  }

  async configureEncoder(config: Partial<VideoEncoderConfig> & { codec: string }): Promise<boolean> {
    const fullConfig: VideoEncoderConfig = {
      width: config.width ?? 1920,
      height: config.height ?? 1080,
      bitrate: config.bitrate ?? 5_000_000,
      framerate: config.framerate ?? 30,
      hardwareAcceleration: config.hardwareAcceleration ?? 'prefer-hardware',
      latencyMode: config.latencyMode ?? 'quality',
      bitrateMode: config.bitrateMode ?? 'variable',
      ...config
    };

    const support = await VideoEncoder.isConfigSupported(fullConfig);
    if (!support.supported) {
      log.warn('Encoder config not supported:', fullConfig);
      return false;
    }

    this.encoderConfig = support.config!;
    return true;
  }

  addProcessor(processor: FrameProcessor): void {
    this.processors.push(processor);
  }

  clearProcessors(): void {
    this.processors = [];
  }

  // ============================================================
  // Decoding
  // ============================================================

  async decodeFrame(chunk: EncodedVideoChunk): Promise<VideoFrame> {
    if (!this.decoderConfig) {
      throw new Error('Decoder not configured');
    }
    const config = this.decoderConfig;

    // Completion is driven by flush() — the only reliable "all output
    // delivered" signal — not by the first output callback, which may never
    // fire for a delta chunk that the decoder cannot produce a frame from.
    const frames: VideoFrame[] = [];
    const decoder = new VideoDecoder({
      output: (frame) => {
        this.stats.decodedFrames++;
        frames.push(frame);
      },
      error: (e) => log.error('Decode error:', e)
    });

    try {
      decoder.configure(config);
      decoder.decode(chunk);
      await decoder.flush();
    } finally {
      closeQuietly(decoder);
    }

    if (frames.length === 0) {
      throw new Error('Decoder produced no frame for chunk');
    }
    // Return the first frame; close any extras so they are not leaked.
    for (let i = 1; i < frames.length; i++) frames[i].close();
    return frames[0];
  }

  async decodeFrames(chunks: EncodedVideoChunk[]): Promise<VideoFrame[]> {
    if (!this.decoderConfig) {
      throw new Error('Decoder not configured');
    }
    const config = this.decoderConfig;

    // Resolve when flush() reports all queued work is drained. Gating on
    // output-count == input-count hangs forever (and leaks the decoder) when
    // the codec emits a different number of frames — normal with B-frame
    // reordering or dropped/corrupt input.
    const frames: VideoFrame[] = [];
    const decoder = new VideoDecoder({
      output: (frame) => {
        this.stats.decodedFrames++;
        frames.push(frame);
      },
      error: (e) => log.error('Decode error:', e)
    });

    try {
      decoder.configure(config);
      for (const chunk of chunks) {
        decoder.decode(chunk);
      }
      await decoder.flush();
    } finally {
      closeQuietly(decoder);
    }

    return frames;
  }

  // ============================================================
  // Encoding
  // ============================================================

  async encodeFrame(frame: VideoFrame, keyFrame = false): Promise<EncodedVideoChunk> {
    if (!this.encoderConfig) {
      throw new Error('Encoder not configured');
    }
    const config = this.encoderConfig;

    // See decodeFrame: completion is driven by flush(), and the encoder is
    // always released via finally so a failed encode cannot leak it.
    const chunks: EncodedVideoChunk[] = [];
    const encoder = new VideoEncoder({
      output: (chunk) => {
        this.stats.encodedFrames++;
        chunks.push(chunk);
      },
      error: (e) => log.error('Encode error:', e)
    });

    try {
      encoder.configure(config);
      encoder.encode(frame, { keyFrame });
      await encoder.flush();
    } finally {
      closeQuietly(encoder);
    }

    if (chunks.length === 0) {
      throw new Error('Encoder produced no chunk for frame');
    }
    return chunks[0];
  }

  async encodeFrames(frames: VideoFrame[], keyFrameInterval = 30): Promise<EncodedVideoChunk[]> {
    if (!this.encoderConfig) {
      throw new Error('Encoder not configured');
    }
    const config = this.encoderConfig;

    // Resolve on flush() rather than output-count == frame-count: an encoder
    // may emit a different number of chunks (e.g. coalescing), which would
    // otherwise hang forever and leak the encoder.
    const chunks: EncodedVideoChunk[] = [];
    const encoder = new VideoEncoder({
      output: (chunk) => {
        this.stats.encodedFrames++;
        chunks.push(chunk);
      },
      error: (e) => log.error('Encode error:', e)
    });

    try {
      encoder.configure(config);
      frames.forEach((frame, i) => {
        encoder.encode(frame, { keyFrame: i % keyFrameInterval === 0 });
      });
      await encoder.flush();
    } finally {
      closeQuietly(encoder);
    }

    return chunks;
  }

  // ============================================================
  // Transcode Pipeline
  // ============================================================

  async transcode(
    inputChunks: AsyncIterable<EncodedVideoChunk> | EncodedVideoChunk[],
    onProgress?: (progress: number) => void
  ): Promise<EncodedVideoChunk[]> {
    if (!this.decoderConfig || !this.encoderConfig) {
      throw new Error('Pipeline not fully configured');
    }

    const outputChunks: EncodedVideoChunk[] = [];
    let processedCount = 0;
    let totalCount = 0;

    // Count total if array
    if (Array.isArray(inputChunks)) {
      totalCount = inputChunks.length;
    }

    const decoder = new VideoDecoderStream(this.decoderConfig);
    const encoder = new VideoEncoderStream(this.encoderConfig);

    // Create frame-to-encoder adapter
    const frameAdapter = new TransformStream<DecodedFrame, VideoFrame>({
      transform: (item, controller) => {
        controller.enqueue(item.frame);
      }
    });

    // Collect output
    const outputCollector = new WritableStream<EncodedChunk>({
      write: (chunk) => {
        outputChunks.push(chunk.chunk);
        processedCount++;
        
        if (onProgress && totalCount > 0) {
          onProgress(processedCount / totalCount);
        }
      }
    });

    // Create input stream
    const inputStream = Array.isArray(inputChunks)
      ? new ReadableStream({
          start(controller) {
            for (const chunk of inputChunks) {
              controller.enqueue(chunk);
            }
            controller.close();
          }
        })
      : new ReadableStream({
          async start(controller) {
            for await (const chunk of inputChunks) {
              controller.enqueue(chunk);
              totalCount++;
            }
            controller.close();
          }
        });

    // Run pipeline: decode → processors → frames → encode → collect.
    // The processor chain must be threaded onto the live decoded stream.
    // Building it off a second reference to decoder.readable both dropped the
    // processors and double-locked the stream (throwing whenever any
    // processor was configured).
    let frameStream: ReadableStream<DecodedFrame> = inputStream.pipeThrough(decoder);
    for (const processor of this.processors) {
      frameStream = frameStream.pipeThrough(new FrameProcessorStream(processor));
    }

    try {
      await frameStream
        .pipeThrough(frameAdapter)
        .pipeThrough(encoder)
        .pipeTo(outputCollector);
    } finally {
      // flush() closes codecs on clean completion; close here guards error paths
      // where flush() is never called (stream abort propagation skips it).
      const dec = decoder.getDecoder();
      const enc = encoder.getEncoder();
      if (dec && dec.state !== 'closed') dec.close();
      if (enc && enc.state !== 'closed') enc.close();
    }

    return outputChunks;
  }

  // ============================================================
  // Frame Extraction
  // ============================================================

  /**
   * Decode and return the frame displayed at `targetTime` (microseconds), or
   * null when no frame at or before that time exists.
   *
   * Selection is by timestamp, not by frame ordinal. The previous version
   * compared a chunk *array index* (`keyFrameIndex`, `frameCount`) against a
   * frame number derived from time (`floor(targetTime * fps / 1e6)`) — two
   * different coordinate systems that only coincided when `chunks` was the
   * whole stream from frame 0, one chunk per frame, constant fps, and no
   * B-frame reordering. Any sub-range, variable frame rate, mismatched `fps`,
   * or B-frames returned null or the wrong frame. Timestamps put chunks,
   * decoded frames, and the target on one axis, so seeking is correct for all
   * of those cases — and `fps` is no longer needed.
   */
  async extractFrameAtTime(
    chunks: EncodedVideoChunk[],
    targetTime: number
  ): Promise<VideoFrame | null> {
    if (!this.decoderConfig) {
      throw new Error('Decoder not configured');
    }
    const config = this.decoderConfig;

    // Decoding must start at a keyframe; pick the latest one at or before the
    // target so we decode as few frames as possible.
    let keyFrameIndex = 0;
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i].type === 'key' && chunks[i].timestamp <= targetTime) {
        keyFrameIndex = i;
        break;
      }
    }

    // Keep the frame with the greatest timestamp <= target (the one on screen
    // at targetTime) and close every other decoded frame. Tracking by
    // timestamp is robust to decode/presentation reordering (B-frames).
    let best: VideoFrame | null = null;
    const decoder = new VideoDecoder({
      output: (frame) => {
        this.stats.decodedFrames++;
        if (frame.timestamp <= targetTime && (!best || frame.timestamp > best.timestamp)) {
          if (best) best.close();
          best = frame;
        } else {
          frame.close();
        }
      },
      error: (e) => log.error('Decode error:', e)
    });

    try {
      decoder.configure(config);
      let i = keyFrameIndex;
      for (; i < chunks.length && chunks[i].timestamp <= targetTime; i++) {
        decoder.decode(chunks[i]);
      }
      // Feed one chunk past the target so a B-frame at the target can resolve
      // its forward reference; that later frame is discarded by the selector.
      if (i < chunks.length) decoder.decode(chunks[i]);
      await decoder.flush();
    } finally {
      closeQuietly(decoder);
    }

    return best;
  }

  // ============================================================
  // Thumbnail Generation
  // ============================================================

  async generateThumbnails(
    chunks: EncodedVideoChunk[],
    count: number,
    width = 160,
    height = 90
  ): Promise<ImageBitmap[]> {
    if (!this.decoderConfig) {
      throw new Error('Decoder not configured');
    }

    // Empty input would index chunks[-1] below; nothing to extract.
    if (chunks.length === 0 || count <= 0) return [];

    const thumbnails: ImageBitmap[] = [];
    // Clamp to >=1: for short clips floor(length/count) is 0, which collapses
    // every thumbnail onto chunk 0 instead of spreading across the timeline.
    const interval = Math.max(1, Math.floor(chunks.length / count));

    // Single canvas reused for all thumbnails (same dimensions) — createImageBitmap
    // captures a snapshot of the current canvas state, so reuse is safe.
    const thumbCanvas = new OffscreenCanvas(width, height);
    const thumbCtx = thumbCanvas.getContext('2d')!;
    setHighQualityScaling(thumbCtx);

    for (let i = 0; i < count; i++) {
      const chunkIndex = Math.min(i * interval, chunks.length - 1);

      // extractFrameAtTime already seeks from the nearest keyframe ≤ the
      // target timestamp, so no keyframe lookup is needed here.
      const frame = await this.extractFrameAtTime(
        chunks,
        chunks[chunkIndex].timestamp
      );

      if (frame) {
        thumbCtx.drawImage(frame, 0, 0, width, height);
        frame.close();
        thumbnails.push(await createImageBitmap(thumbCanvas));
      }
    }

    return thumbnails;
  }

  // ============================================================
  // Stats
  // ============================================================

  getStats(): PipelineStats {
    return { ...this.stats };
  }

  resetStats(): void {
    this.stats = {
      decodedFrames: 0,
      encodedFrames: 0,
      droppedFrames: 0,
      avgDecodeTime: 0,
      avgEncodeTime: 0,
      queueSize: 0
    };
  }
}

// ============================================================
// Built-in Frame Processors
// ============================================================

// Module-level canvas for grayscale — reused across frames (grayscale has no
// configuration params so a single shared instance is sufficient).
// new VideoFrame(canvas, …) snapshots pixel state synchronously, so the canvas
// can be reused immediately after the call returns.
let _grayscaleCanvas: OffscreenCanvas | null = null;
let _grayscaleCtx: OffscreenCanvasRenderingContext2D | null = null;

export const FrameProcessors = {
  // Grayscale conversion
  grayscale: async (frame: VideoFrame): Promise<VideoFrame> => {
    const w = frame.displayWidth, h = frame.displayHeight;
    if (!_grayscaleCanvas || _grayscaleCanvas.width !== w || _grayscaleCanvas.height !== h) {
      _grayscaleCanvas = new OffscreenCanvas(w, h);
      // willReadFrequently: pixels are read back via getImageData below.
      _grayscaleCtx = _grayscaleCanvas.getContext('2d', { willReadFrequently: true })!;
    }
    _grayscaleCtx!.drawImage(frame, 0, 0);
    const imageData = _grayscaleCtx!.getImageData(0, 0, w, h);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = data[i + 1] = data[i + 2] = gray;
    }

    _grayscaleCtx!.putImageData(imageData, 0, 0);
    return new VideoFrame(_grayscaleCanvas, { timestamp: frame.timestamp });
  },

  // Brightness/Contrast adjustment
  brightnessContrast: (brightness: number, contrast: number) => {
    // Lazy-init canvas per closure: each factory call gets its own canvas that
    // is created on the first frame and resized only when dimensions change.
    // new VideoFrame(canvas, …) snapshots pixel state, so canvas reuse is safe.
    let canvas: OffscreenCanvas | null = null;
    let ctx: OffscreenCanvasRenderingContext2D | null = null;
    const filterStr = `brightness(${1 + brightness}) contrast(${1 + contrast})`;
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      const { displayWidth: w, displayHeight: h } = frame;
      if (!canvas || canvas.width !== w || canvas.height !== h) {
        canvas = new OffscreenCanvas(w, h);
        ctx = canvas.getContext('2d')!;
        ctx.filter = filterStr;
      }
      ctx!.drawImage(frame, 0, 0);
      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  },

  // Resize
  resize: (width: number, height: number) => {
    // Canvas dimensions are fixed by the factory args — create once, reuse every frame.
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    setHighQualityScaling(ctx);
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      ctx.drawImage(frame, 0, 0, width, height);
      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  },

  // Crop
  crop: (x: number, y: number, width: number, height: number) => {
    // Output dimensions are fixed by factory args — create canvas once.
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      ctx.drawImage(frame, x, y, width, height, 0, 0, width, height);
      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  },

  // Rotate
  rotate: (degrees: number) => {
    // degrees is fixed by the factory arg, so trig constants are computed once.
    const radians = degrees * Math.PI / 180;
    const cos = Math.abs(Math.cos(radians));
    const sin = Math.abs(Math.sin(radians));
    // Lazy-grow canvas: output dimensions depend on input frame size. For a fixed
    // source resolution (the common case) the canvas is created once and reused.
    let canvas: OffscreenCanvas | null = null;
    let ctx: OffscreenCanvasRenderingContext2D | null = null;
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      const newWidth  = frame.displayWidth  * cos + frame.displayHeight * sin;
      const newHeight = frame.displayWidth  * sin + frame.displayHeight * cos;
      if (!canvas || canvas.width !== newWidth || canvas.height !== newHeight) {
        canvas = new OffscreenCanvas(newWidth, newHeight);
        ctx = canvas.getContext('2d')!;
      }
      ctx!.setTransform(1, 0, 0, 1, 0, 0); // reset before each frame
      ctx!.translate(newWidth / 2, newHeight / 2);
      ctx!.rotate(radians);
      ctx!.drawImage(frame, -frame.displayWidth / 2, -frame.displayHeight / 2);
      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  },

  // Flip
  flip: (horizontal: boolean, vertical: boolean) => {
    // Lazy-init canvas: created on first frame, reused when dimensions are stable.
    // setTransform() replaces (not accumulates) the transform matrix, so no save/restore.
    let canvas: OffscreenCanvas | null = null;
    let ctx: OffscreenCanvasRenderingContext2D | null = null;
    const sx = horizontal ? -1 : 1;
    const sy = vertical   ? -1 : 1;
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      const { displayWidth: w, displayHeight: h } = frame;
      if (!canvas || canvas.width !== w || canvas.height !== h) {
        canvas = new OffscreenCanvas(w, h);
        ctx = canvas.getContext('2d')!;
      }
      ctx!.setTransform(sx, 0, 0, sy, horizontal ? w : 0, vertical ? h : 0);
      ctx!.drawImage(frame, 0, 0);
      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  },

  // Watermark
  watermark: (text: string, position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'bottom-right') => {
    // Lazy-init canvas per closure: created on the first frame, resized only when
    // frame dimensions change. Text metrics and context state set once at init.
    let canvas: OffscreenCanvas | null = null;
    let ctx: OffscreenCanvasRenderingContext2D | null = null;
    let metricsWidth = 0;
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      const { displayWidth: w, displayHeight: h } = frame;
      if (!canvas || canvas.width !== w || canvas.height !== h) {
        canvas = new OffscreenCanvas(w, h);
        ctx = canvas.getContext('2d')!;
        ctx.font = '24px sans-serif';
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        // measureText is computed once per resolution; text and font don't change.
        metricsWidth = ctx.measureText(text).width;
      }

      ctx!.drawImage(frame, 0, 0);

      const padding = 20;
      let x: number, y: number;

      switch (position) {
        case 'top-left':
          x = padding;
          y = 24 + padding;
          break;
        case 'top-right':
          x = w - metricsWidth - padding;
          y = 24 + padding;
          break;
        case 'bottom-left':
          x = padding;
          y = h - padding;
          break;
        case 'bottom-right':
        default:
          x = w - metricsWidth - padding;
          y = h - padding;
      }

      ctx!.strokeText(text, x, y);
      ctx!.fillText(text, x, y);

      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  }
};

// ============================================================
// Export
// ============================================================

export default VideoPipeline;
