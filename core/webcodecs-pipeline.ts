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
    let decoder: VideoDecoder;
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
        this.decoder = decoder;
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
    let encoder: VideoEncoder;
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
        this.encoder = encoder;
      },
      
      transform: (frame, _controller) => {
        const isKeyFrame = frameCount % keyFrameInterval === 0;
        encoder.encode(frame, { keyFrame: isKeyFrame });
        frame.close();
        frameCount++;
      },
      
      flush: async () => {
        await encoder.flush();
        encoder.close();
      }
    });
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

    return new Promise((resolve, reject) => {
      const decoder = new VideoDecoder({
        output: (frame) => {
          this.stats.decodedFrames++;
          resolve(frame);
        },
        error: reject
      });

      decoder.configure(this.decoderConfig!);
      decoder.decode(chunk);
      decoder.flush().then(() => decoder.close());
    });
  }

  async decodeFrames(chunks: EncodedVideoChunk[]): Promise<VideoFrame[]> {
    if (!this.decoderConfig) {
      throw new Error('Decoder not configured');
    }

    const frames: VideoFrame[] = [];

    return new Promise((resolve, reject) => {
      const decoder = new VideoDecoder({
        output: (frame) => {
          this.stats.decodedFrames++;
          frames.push(frame);
          
          if (frames.length === chunks.length) {
            decoder.close();
            resolve(frames);
          }
        },
        error: reject
      });

      decoder.configure(this.decoderConfig!);
      
      for (const chunk of chunks) {
        decoder.decode(chunk);
      }
      
      decoder.flush();
    });
  }

  // ============================================================
  // Encoding
  // ============================================================

  async encodeFrame(frame: VideoFrame, keyFrame = false): Promise<EncodedVideoChunk> {
    if (!this.encoderConfig) {
      throw new Error('Encoder not configured');
    }

    return new Promise((resolve, reject) => {
      const encoder = new VideoEncoder({
        output: (chunk) => {
          this.stats.encodedFrames++;
          resolve(chunk);
        },
        error: reject
      });

      encoder.configure(this.encoderConfig!);
      encoder.encode(frame, { keyFrame });
      encoder.flush().then(() => encoder.close());
    });
  }

  async encodeFrames(frames: VideoFrame[], keyFrameInterval = 30): Promise<EncodedVideoChunk[]> {
    if (!this.encoderConfig) {
      throw new Error('Encoder not configured');
    }

    const chunks: EncodedVideoChunk[] = [];

    return new Promise((resolve, reject) => {
      const encoder = new VideoEncoder({
        output: (chunk) => {
          this.stats.encodedFrames++;
          chunks.push(chunk);
          
          if (chunks.length === frames.length) {
            encoder.close();
            resolve(chunks);
          }
        },
        error: reject
      });

      encoder.configure(this.encoderConfig!);
      
      frames.forEach((frame, i) => {
        encoder.encode(frame, { keyFrame: i % keyFrameInterval === 0 });
      });
      
      encoder.flush();
    });
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

    // Build processor chain
    let stream: ReadableStream<DecodedFrame> = decoder.readable;
    
    for (const processor of this.processors) {
      const processorStream = new FrameProcessorStream(processor);
      stream = stream.pipeThrough(processorStream);
    }

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

    // Run pipeline
    await inputStream
      .pipeThrough(decoder)
      .pipeThrough(frameAdapter)
      .pipeThrough(encoder)
      .pipeTo(outputCollector);

    return outputChunks;
  }

  // ============================================================
  // Frame Extraction
  // ============================================================

  async extractFrameAtTime(
    chunks: EncodedVideoChunk[],
    targetTime: number,
    fps = 30
  ): Promise<VideoFrame | null> {
    if (!this.decoderConfig) {
      throw new Error('Decoder not configured');
    }

    // Find nearest keyframe before target time
    let keyFrameIndex = 0;
    for (let i = chunks.length - 1; i >= 0; i--) {
      if (chunks[i].type === 'key' && chunks[i].timestamp <= targetTime) {
        keyFrameIndex = i;
        break;
      }
    }

    // Decode from keyframe to target
    const targetIndex = Math.floor(targetTime * fps / 1_000_000);
    let targetFrame: VideoFrame | null = null;

    return new Promise((resolve, reject) => {
      let frameCount = keyFrameIndex;

      const decoder = new VideoDecoder({
        output: (frame) => {
          if (frameCount === targetIndex) {
            targetFrame = frame;
          } else {
            frame.close();
          }
          frameCount++;
        },
        error: reject
      });

      decoder.configure(this.decoderConfig!);

      // Decode chunks from keyframe to target
      for (let i = keyFrameIndex; i <= targetIndex && i < chunks.length; i++) {
        decoder.decode(chunks[i]);
      }

      decoder.flush().then(() => {
        decoder.close();
        resolve(targetFrame);
      });
    });
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

    const thumbnails: ImageBitmap[] = [];
    const interval = Math.floor(chunks.length / count);

    for (let i = 0; i < count; i++) {
      const chunkIndex = Math.min(i * interval, chunks.length - 1);
      
      // Find nearest keyframe
      let keyFrameIndex = chunkIndex;
      while (keyFrameIndex > 0 && chunks[keyFrameIndex].type !== 'key') {
        keyFrameIndex--;
      }

      const frame = await this.extractFrameAtTime(
        chunks,
        chunks[chunkIndex].timestamp,
        30
      );

      if (frame) {
        const canvas = new OffscreenCanvas(width, height);
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(frame, 0, 0, width, height);
        frame.close();

        const thumbnail = await createImageBitmap(canvas);
        thumbnails.push(thumbnail);
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

export const FrameProcessors = {
  // Grayscale conversion
  grayscale: async (frame: VideoFrame): Promise<VideoFrame> => {
    const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
    const ctx = canvas.getContext('2d')!;
    
    ctx.drawImage(frame, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    
    for (let i = 0; i < data.length; i += 4) {
      const gray = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
      data[i] = data[i + 1] = data[i + 2] = gray;
    }
    
    ctx.putImageData(imageData, 0, 0);
    
    return new VideoFrame(canvas, { timestamp: frame.timestamp });
  },

  // Brightness/Contrast adjustment
  brightnessContrast: (brightness: number, contrast: number) => {
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
      const ctx = canvas.getContext('2d')!;
      
      ctx.filter = `brightness(${1 + brightness}) contrast(${1 + contrast})`;
      ctx.drawImage(frame, 0, 0);
      
      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  },

  // Resize
  resize: (width: number, height: number) => {
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      
      ctx.drawImage(frame, 0, 0, width, height);
      
      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  },

  // Crop
  crop: (x: number, y: number, width: number, height: number) => {
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d')!;
      
      ctx.drawImage(
        frame,
        x, y, width, height,
        0, 0, width, height
      );
      
      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  },

  // Rotate
  rotate: (degrees: number) => {
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      const radians = degrees * Math.PI / 180;
      const cos = Math.abs(Math.cos(radians));
      const sin = Math.abs(Math.sin(radians));
      
      const newWidth = frame.displayWidth * cos + frame.displayHeight * sin;
      const newHeight = frame.displayWidth * sin + frame.displayHeight * cos;
      
      const canvas = new OffscreenCanvas(newWidth, newHeight);
      const ctx = canvas.getContext('2d')!;
      
      ctx.translate(newWidth / 2, newHeight / 2);
      ctx.rotate(radians);
      ctx.drawImage(frame, -frame.displayWidth / 2, -frame.displayHeight / 2);
      
      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  },

  // Flip
  flip: (horizontal: boolean, vertical: boolean) => {
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
      const ctx = canvas.getContext('2d')!;
      
      ctx.translate(
        horizontal ? frame.displayWidth : 0,
        vertical ? frame.displayHeight : 0
      );
      ctx.scale(
        horizontal ? -1 : 1,
        vertical ? -1 : 1
      );
      ctx.drawImage(frame, 0, 0);
      
      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  },

  // Watermark
  watermark: (text: string, position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' = 'bottom-right') => {
    return async (frame: VideoFrame): Promise<VideoFrame> => {
      const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
      const ctx = canvas.getContext('2d')!;
      
      ctx.drawImage(frame, 0, 0);
      
      ctx.font = '24px sans-serif';
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.5)';
      ctx.lineWidth = 2;
      
      const metrics = ctx.measureText(text);
      const padding = 20;
      
      let x: number, y: number;
      
      switch (position) {
        case 'top-left':
          x = padding;
          y = 24 + padding;
          break;
        case 'top-right':
          x = frame.displayWidth - metrics.width - padding;
          y = 24 + padding;
          break;
        case 'bottom-left':
          x = padding;
          y = frame.displayHeight - padding;
          break;
        case 'bottom-right':
        default:
          x = frame.displayWidth - metrics.width - padding;
          y = frame.displayHeight - padding;
      }
      
      ctx.strokeText(text, x, y);
      ctx.fillText(text, x, y);
      
      return new VideoFrame(canvas, { timestamp: frame.timestamp });
    };
  }
};

// ============================================================
// Export
// ============================================================

export default VideoPipeline;
