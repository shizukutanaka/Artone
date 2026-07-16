/**
 * Artone v3 — Export System
 * 
 * 動画書き出しシステム
 * - WebCodecs エンコード
 * - MP4/WebM muxing
 * - プリセット管理
 * - バックグラウンド処理
 * - 進捗トラッキング
 * 
 * @version 1.0.0
 */
import { encodeWAVBlob, type WavBitDepth } from './wav-encoder';
import { encodeGif, type GifFrameInput } from './gif-encoder';
import {
  muxWebM,
  toWebMVideoCodecId,
  toWebMAudioCodecId,
  type VideoChunkRef,
  type AudioChunkRef,
} from './webm-muxer';
import { muxMP4, buildAacAudioSpecificConfig } from './mp4-muxer';

// ============================================================
// Types
// ============================================================

export interface ExportConfig {
  format: 'mp4' | 'webm' | 'gif';
  codec: string;
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  audioBitrate: number;
  quality: 'low' | 'medium' | 'high' | 'ultra';
  hardwareAcceleration: boolean;
}

export interface ExportPreset {
  id: string;
  name: string;
  description: string;
  config: ExportConfig;
}

export interface ExportJob {
  id: string;
  projectId: string;
  config: ExportConfig;
  status: 'pending' | 'encoding' | 'muxing' | 'complete' | 'error' | 'cancelled';
  progress: number;
  currentFrame: number;
  totalFrames: number;
  startTime: number;
  estimatedTimeRemaining: number;
  outputPath: string;
  error?: string;
}

export interface EncodedData {
  video: VideoChunkRef[];
  audio: AudioChunkRef[] | null;
  duration: number;
}

type ProgressCallback = (progress: number, status: string) => void;

// ============================================================
// WebCodecs Back-Pressure
// ============================================================
//
// VideoEncoder/AudioEncoder.encode() は同期的にキューへ投入されるだけで、
// 実エンコードは非同期。チェックなしにループで投入し続けると、エンコード速度
// より供給速度が早い場合 (CPU バウンド・高解像度・低性能機) にキューが
// 無制限に伸び、GPU/VideoFrame メモリを枯渇させてブラウザがクラッシュする。
//
// Chrome 公式のベストプラクティスは「encodeQueueSize を監視し、閾値超過時に
// 'dequeue' イベントを待つ」こと:
//   https://developer.chrome.com/docs/web-platform/best-practices/webcodecs
// Qiita: 「フレームをエンコード速度より早く送ると memory exhaustion」
//   https://qiita.com/alivelime/items/34cababe3105c2af8068
//
// 純関数として export し、エンコーダタイプを問わずテスト可能にする。

/** デフォルトの最大エンコードキューサイズ。Chrome 公式推奨に基づく安全値。 */
export const DEFAULT_MAX_ENCODE_QUEUE = 8;

/**
 * encoder.encodeQueueSize が `maxQueue` を超えていれば、`dequeue` イベントで
 * キューが減るのを待つ。閾値以下なら即時 resolve。
 *
 * 純粋に EventTarget+`encodeQueueSize` の duck-typed インタフェースに依存
 * するため、VideoEncoder/AudioEncoder のどちらにも適用可能。
 */
export async function awaitEncoderQueueBelow(
  encoder: EventTarget & { encodeQueueSize: number },
  maxQueue: number = DEFAULT_MAX_ENCODE_QUEUE,
  timeoutMs = 10_000,
): Promise<void> {
  if (encoder.encodeQueueSize < maxQueue) return;
  // 'dequeue' は queue が減るたびに発火するため、once 待ちで十分。
  // 1回の dequeue で必ず閾値未満になるとは限らないが、loop 側が次回必ず再チェックする。
  // Timeout guard: if the encoder closes/errors without firing 'dequeue', the
  // Promise would hang indefinitely without this deadline.
  await new Promise<void>((resolve, reject) => {
    const onDequeue = () => { clearTimeout(timer); resolve(); };
    const timer = setTimeout(() => {
      encoder.removeEventListener('dequeue', onDequeue);
      reject(new Error(`awaitEncoderQueueBelow: no dequeue within ${timeoutMs}ms — encoder may have stalled`));
    }, timeoutMs);
    encoder.addEventListener('dequeue', onDequeue, { once: true });
  });
}

// ============================================================
// Presets
// ============================================================

export const EXPORT_PRESETS: ExportPreset[] = [
  {
    id: 'youtube-4k',
    name: 'YouTube 4K',
    description: '4K UHD for YouTube',
    config: {
      format: 'mp4',
      // High L5.2 (0x34). 4K60 = 240×135 MBs × 60 = 1,944,000 MB/s, which
      // exceeds L5.1's (0x33) MaxMBPS of 983,040 — a conformant encoder's
      // isConfigSupported() rejects the too-low level. L5.2's 2,073,600
      // covers it. (Was avc1.640033 = L5.1.)
      codec: 'avc1.640034',
      width: 3840,
      height: 2160,
      fps: 60,
      bitrate: 45_000_000,
      audioBitrate: 320_000,
      quality: 'ultra',
      hardwareAcceleration: true
    }
  },
  {
    id: 'youtube-1080p',
    name: 'YouTube 1080p',
    description: '1080p HD for YouTube',
    config: {
      format: 'mp4',
      // High L4.2 (0x2A). 1080p60 = 120×68 MBs × 60 = 489,600 MB/s, which
      // exceeds L4.0's (0x28) MaxMBPS of 245,760 — a conformant encoder's
      // isConfigSupported() rejects the too-low level. L4.2's 522,240
      // covers it. (Was avc1.640028 = L4.0.)
      codec: 'avc1.64002A',
      width: 1920,
      height: 1080,
      fps: 60,
      bitrate: 12_000_000,
      audioBitrate: 256_000,
      quality: 'high',
      hardwareAcceleration: true
    }
  },
  {
    id: 'twitter',
    name: 'Twitter/X',
    description: 'Optimized for Twitter',
    config: {
      format: 'mp4',
      // Main L3.1 (0x1F). 720p30 = 80×45 = 3,600 MBs/frame, which exceeds
      // L3.0's (0x1E) MaxFS of 1,620 (and its 40,500 MaxMBPS). L3.1's
      // MaxFS 3,600 / MaxMBPS 108,000 cover it exactly. (Was avc1.4D001E = L3.0.)
      codec: 'avc1.4D001F',
      width: 1280,
      height: 720,
      fps: 30,
      bitrate: 5_000_000,
      audioBitrate: 128_000,
      quality: 'medium',
      hardwareAcceleration: true
    }
  },
  {
    id: 'instagram-feed',
    name: 'Instagram Feed',
    description: '1:1 Square for Instagram',
    config: {
      format: 'mp4',
      // Main L3.2 (0x20). 1080² = 68×68 = 4,624 MBs/frame, exceeding L3.1's
      // (0x1F) MaxFS of 3,600. L3.2's MaxFS 5,120 / MaxMBPS 216,000 cover it.
      // (Was avc1.4D001E = L3.0, whose 1,620 MaxFS was far too small.)
      codec: 'avc1.4D0020',
      width: 1080,
      height: 1080,
      fps: 30,
      bitrate: 5_000_000,
      audioBitrate: 128_000,
      quality: 'medium',
      hardwareAcceleration: true
    }
  },
  {
    id: 'instagram-reels',
    name: 'Instagram Reels',
    description: '9:16 Vertical for Reels/TikTok',
    config: {
      format: 'mp4',
      // Main L4.0 (0x28). 1080×1920 = 68×120 = 8,160 MBs/frame, exceeding
      // L3.2's (0x20) MaxFS of 5,120. L4.0's MaxFS 8,192 / MaxMBPS 245,760
      // cover it. (Was avc1.4D001E = L3.0.)
      codec: 'avc1.4D0028',
      width: 1080,
      height: 1920,
      fps: 30,
      bitrate: 8_000_000,
      audioBitrate: 128_000,
      quality: 'high',
      hardwareAcceleration: true
    }
  },
  {
    id: 'webm-vp9',
    name: 'WebM VP9',
    description: 'High quality WebM',
    config: {
      format: 'webm',
      codec: 'vp09.00.10.08',
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: 8_000_000,
      audioBitrate: 192_000,
      quality: 'high',
      hardwareAcceleration: true
    }
  },
  {
    id: 'gif',
    name: 'Animated GIF',
    description: 'GIF animation (no audio)',
    config: {
      format: 'gif',
      codec: 'gif',
      width: 480,
      height: 270,
      fps: 15,
      bitrate: 0,
      audioBitrate: 0,
      quality: 'medium',
      hardwareAcceleration: false
    }
  },
  {
    id: 'proxy',
    name: 'Proxy (Low-Res)',
    description: 'Low resolution for editing',
    config: {
      format: 'mp4',
      codec: 'avc1.42001E',
      width: 640,
      height: 360,
      fps: 30,
      bitrate: 1_000_000,
      audioBitrate: 64_000,
      quality: 'low',
      hardwareAcceleration: true
    }
  }
];

// ============================================================
// Export Engine
// ============================================================

export class ExportEngine {
  private jobs: Map<string, ExportJob> = new Map();
  private encoder: VideoEncoder | null = null;
  private audioEncoder: AudioEncoder | null = null;
  // Actual sample rate/channel count used by the most recent encodeAudio()
  // call, so mux() can declare matching container metadata instead of
  // assuming every source is 48kHz stereo.
  private lastAudioSampleRate = 48000;
  private lastAudioChannels = 2;
  private abortController: AbortController | null = null;
  private listeners: Set<(job: ExportJob) => void> = new Set();
  // Cached canvas for videoFrameToImageData() — recreated only on resolution change.
  private _gifCanvas: OffscreenCanvas | null = null;
  private _gifCtx: OffscreenCanvasRenderingContext2D | null = null;

  // ============================================================
  // Job Management
  // ============================================================

  createJob(projectId: string, config: ExportConfig): ExportJob {
    const job: ExportJob = {
      id: crypto.randomUUID(),
      projectId,
      config,
      status: 'pending',
      progress: 0,
      currentFrame: 0,
      totalFrames: 0,
      startTime: 0,
      estimatedTimeRemaining: 0,
      outputPath: ''
    };

    this.jobs.set(job.id, job);
    return job;
  }

  getJob(jobId: string): ExportJob | undefined {
    return this.jobs.get(jobId);
  }

  cancelJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (job && (job.status === 'pending' || job.status === 'encoding' || job.status === 'muxing')) {
      job.status = 'cancelled';
      this.abortController?.abort();
      this.notifyListeners(job);
    }
  }

  /**
   * Release a finished job and revoke its output object URL.
   * Call this when the UI no longer needs `job.outputPath` to allow the
   * exported Blob to be garbage-collected.
   */
  releaseJob(jobId: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;
    if (job.outputPath?.startsWith('blob:')) URL.revokeObjectURL(job.outputPath);
    this.jobs.delete(jobId);
  }

  // ============================================================
  // Export Pipeline
  // ============================================================

  async export(
    job: ExportJob,
    renderFrame: (frameIndex: number) => Promise<VideoFrame>,
    audioBuffer: AudioBuffer | null,
    duration: number,
    onProgress?: ProgressCallback
  ): Promise<Blob> {
    // Validate fps/dimensions at the entry point so downstream muxer arithmetic
    // never receives 0 (which would produce NaN sampleDelta → corrupt stts box).
    if (!(job.config.fps > 0)) throw new RangeError(`ExportConfig.fps must be > 0, got ${job.config.fps}`);
    if (!(job.config.width > 0)) throw new RangeError(`ExportConfig.width must be > 0, got ${job.config.width}`);
    if (!(job.config.height > 0)) throw new RangeError(`ExportConfig.height must be > 0, got ${job.config.height}`);

    this.abortController = new AbortController();
    job.startTime = Date.now();
    job.totalFrames = Math.ceil(duration * job.config.fps);

    // GIF uses a raw-frame path — no WebCodecs encoding needed
    if (job.config.format === 'gif') {
      return this.exportGif(job, renderFrame, onProgress);
    }

    try {
      // Phase 1: Encode video
      job.status = 'encoding';
      this.notifyListeners(job);

      const videoChunks = await this.encodeVideo(
        job,
        renderFrame,
        (progress) => {
          job.progress = progress * 0.8; // 80% for video encoding
          onProgress?.(job.progress, 'Encoding video...');
          this.notifyListeners(job);
        }
      );

      // Phase 2: Encode audio (GIF already handled above; this path is mp4/webm only)
      let audioChunks: AudioChunkRef[] | null = null;
      if (audioBuffer) {
        onProgress?.(0.8, 'Encoding audio...');
        const result = await this.encodeAudio(audioBuffer, job.config.audioBitrate);
        audioChunks = result.length > 0 ? result : null;
        job.progress = 0.9;
        this.notifyListeners(job);
      }

      // Phase 3: Mux
      job.status = 'muxing';
      onProgress?.(0.9, 'Muxing...');
      this.notifyListeners(job);

      const blob = await this.mux(
        videoChunks,
        audioChunks,
        job.config,
        duration
      );

      job.status = 'complete';
      job.progress = 1;
      job.outputPath = URL.createObjectURL(blob);
      onProgress?.(1, 'Complete');
      this.notifyListeners(job);

      return blob;
    } catch (error) {
      // cancelJob() may have set status='cancelled' before the abort propagated;
      // do not overwrite it with 'error'.
      if (job.status !== 'cancelled') {
        job.status = 'error';
        job.error = error instanceof Error ? error.message : String(error);
      }
      this.notifyListeners(job);
      throw error;
    } finally {
      // WebCodecs spec: close() on an already-closed codec throws InvalidStateError;
      // guard with state check (same pattern as webcodecs-pipeline.ts line 293).
      if (this.encoder && this.encoder.state !== 'closed') this.encoder.close();
      if (this.audioEncoder && this.audioEncoder.state !== 'closed') this.audioEncoder.close();
      this.encoder = null;
      this.audioEncoder = null;
    }
  }

  // ============================================================
  // Video Encoding
  // ============================================================

  private async encodeVideo(
    job: ExportJob,
    renderFrame: (frameIndex: number) => Promise<VideoFrame>,
    onProgress: (progress: number) => void
  ): Promise<VideoChunkRef[]> {
    const chunks: VideoChunkRef[] = [];
    const { config } = job;

    // Check codec support
    const support = await VideoEncoder.isConfigSupported({
      codec: config.codec,
      width: config.width,
      height: config.height,
      bitrate: config.bitrate,
      framerate: config.fps,
      hardwareAcceleration: config.hardwareAcceleration ? 'prefer-hardware' : 'prefer-software'
    });

    if (!support.supported) {
      throw new Error(`Codec ${config.codec} not supported`);
    }

    return new Promise((resolve, reject) => {
      this.encoder = new VideoEncoder({
        output: (chunk) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          chunks.push({
            data,
            timestampUs: chunk.timestamp,
            durationUs: chunk.duration ?? Math.round(1_000_000 / config.fps),
            isKeyframe: chunk.type === 'key',
          });
        },
        error: reject
      });

      this.encoder.configure({
        codec: config.codec,
        width: config.width,
        height: config.height,
        bitrate: config.bitrate,
        framerate: config.fps,
        hardwareAcceleration: config.hardwareAcceleration ? 'prefer-hardware' : 'prefer-software',
        latencyMode: 'quality'
      });

      const encodeFrames = async () => {
        const keyFrameInterval = config.fps * 2; // Keyframe every 2 seconds

        for (let i = 0; i < job.totalFrames; i++) {
          if (this.abortController?.signal.aborted) {
            reject(new Error('Export cancelled'));
            return;
          }

          // Back-pressure: wait if the encoder queue is saturated, otherwise
          // long exports enqueue faster than encoding and exhaust GPU memory.
          await awaitEncoderQueueBelow(this.encoder!);

          const frame = await renderFrame(i);
          try {
            this.encoder!.encode(frame, { keyFrame: i % keyFrameInterval === 0 });
          } finally {
            // Ensure VideoFrame GPU resources are always released, even when
            // encode() throws (e.g. encoder transitioned to 'closed' on error).
            frame.close();
          }

          job.currentFrame = i + 1;
          onProgress((i + 1) / job.totalFrames);

          // Update ETA
          const elapsed = Date.now() - job.startTime;
          const avgTimePerFrame = elapsed / (i + 1);
          job.estimatedTimeRemaining = avgTimePerFrame * (job.totalFrames - i - 1);
        }

        await this.encoder!.flush();
        resolve(chunks);
      };

      encodeFrames().catch(reject);
    });
  }

  // ============================================================
  // Audio Encoding
  // ============================================================

  private async encodeAudio(
    buffer: AudioBuffer,
    bitrate: number
  ): Promise<AudioChunkRef[]> {
    const chunks: AudioChunkRef[] = [];
    const sampleRate = buffer.sampleRate;
    const channels = Math.min(buffer.numberOfChannels, 2);
    this.lastAudioSampleRate = sampleRate;
    this.lastAudioChannels = channels;

    // Check AAC support
    const support = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate,
      numberOfChannels: channels,
      bitrate
    });

    if (!support.supported) {
      // Fallback: no audio — caller handles null
      return [];
    }

    return new Promise((resolve, reject) => {
      // REGRESSION fix: the muxers used to assume every encoded chunk spans
      // exactly `frameSize` samples (see the now-removed hardcoded stts
      // delta in mp4-muxer.ts), but the LAST chunk is shorter whenever
      // buffer.length isn't an exact multiple of frameSize (true for
      // virtually any real-world audio buffer) — overstating the muxed
      // audio track's declared duration. Track each chunk's actual sample
      // count (FIFO — a single AudioEncoder's output order matches its
      // input order) so durationUs reflects the real encoded span, falling
      // back to it only when the browser doesn't populate chunk.duration
      // itself (matches the same chunk.duration ?? fallback pattern the
      // video path already uses).
      const pendingFrameLengths: number[] = [];
      this.audioEncoder = new AudioEncoder({
        output: (chunk) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          const length = pendingFrameLengths.shift() ?? frameSize;
          const durationUs = chunk.duration ?? Math.round((length / sampleRate) * 1_000_000);
          chunks.push({ data, timestampUs: chunk.timestamp, durationUs });
        },
        error: reject
      });

      this.audioEncoder.configure({
        codec: 'mp4a.40.2',
        sampleRate,
        numberOfChannels: channels,
        bitrate
      });

      // Create interleaved audio data
      const frameSize = 1024;
      const totalFrames = Math.ceil(buffer.length / frameSize);

      const encodeAll = async () => {
        // Pre-allocate once at maximum frame size; for f32-planar the WebCodecs
        // AudioData constructor reads only numberOfFrames * channels samples from
        // the start, so passing a larger buffer on the last (shorter) frame is safe.
        const audioBuf = new Float32Array(frameSize * channels);
        for (let f = 0; f < totalFrames; f++) {
          // Back-pressure (see awaitEncoderQueueBelow rationale).
          await awaitEncoderQueueBelow(this.audioEncoder!);
          const offset = f * frameSize;
          const length = Math.min(frameSize, buffer.length - offset);
          pendingFrameLengths.push(length);

          // REGRESSION fix: f32-planar requires all ch-0 samples first, then ch-1.
          // The previous write `data[i * channels + ch]` produced interleaved layout
          // which mismatches f32-planar → garbled audio in the WebCodecs pipeline.
          const data = audioBuf; // reuse pre-allocated buffer
          for (let ch = 0; ch < channels; ch++) {
            const channelData = buffer.getChannelData(ch);
            for (let i = 0; i < length; i++) {
              data[ch * length + i] = channelData[offset + i];
            }
          }

          const audioData = new AudioData({
            format: 'f32-planar',
            sampleRate,
            numberOfFrames: length,
            numberOfChannels: channels,
            timestamp: (offset / sampleRate) * 1_000_000,
            data,
          });

          try {
            this.audioEncoder!.encode(audioData);
          } finally {
            audioData.close();
          }
        }

        await this.audioEncoder!.flush();
        resolve(chunks);
      };

      encodeAll().catch(reject);
    });
  }

  // ============================================================
  // Muxing
  // ============================================================

  private async mux(
    videoChunks: VideoChunkRef[],
    audioChunks: AudioChunkRef[] | null,
    config: ExportConfig,
    _duration: number
  ): Promise<Blob> {
    if (config.format === 'webm') {
      const videoTrack = {
        codecId: toWebMVideoCodecId(config.codec),
        width: config.width,
        height: config.height,
      };
      const hasAudio = audioChunks && audioChunks.length > 0;
      // REGRESSION fix: WebM's A_AAC track requires CodecPrivate (the AAC
      // AudioSpecificConfig) per the Matroska codec spec, since WebCodecs'
      // AAC output is raw (no ADTS header) and a decoder has no other way
      // to learn the sample rate/channel config. Without it, every WebM
      // export with audio produced an undecodable/silent audio track while
      // reporting success. Reuses the same ASC builder mp4-muxer.ts already
      // uses for MP4's esds box.
      const audioTrack = hasAudio ? {
        codecId: toWebMAudioCodecId('mp4a.40.2'),
        sampleRate: this.lastAudioSampleRate,
        channels: this.lastAudioChannels,
        codecPrivate: buildAacAudioSpecificConfig(this.lastAudioSampleRate, this.lastAudioChannels),
      } : undefined;
      const webmBytes = muxWebM(
        videoTrack,
        videoChunks,
        audioTrack,
        hasAudio ? audioChunks! : undefined,
      );
      return new Blob([webmBytes.buffer as ArrayBuffer], { type: 'video/webm' });
    }

    // MP4: full ISOBMFF container with moov + mdat (H.264 includes avcC/AVCC conversion)
    const mp4Track = { codec: config.codec, width: config.width, height: config.height, fps: config.fps };
    const mp4AudioTrack = (audioChunks && audioChunks.length > 0)
      ? { sampleRate: this.lastAudioSampleRate, channels: this.lastAudioChannels }
      : undefined;
    const mp4Bytes = muxMP4(
      mp4Track,
      videoChunks,
      mp4AudioTrack,
      mp4AudioTrack ? audioChunks! : undefined,
    );
    return new Blob([mp4Bytes.buffer as ArrayBuffer], { type: 'video/mp4' });
  }

  /** GIF export path: captures raw frames and encodes with the built-in GIF encoder. */
  private async exportGif(
    job: ExportJob,
    renderFrame: (frameIndex: number) => Promise<VideoFrame>,
    onProgress?: ProgressCallback
  ): Promise<Blob> {
    const { config } = job;
    job.status = 'encoding';
    this.notifyListeners(job);

    const frames: GifFrameInput[] = [];
    const delayMs = Math.round(1000 / config.fps);

    for (let i = 0; i < job.totalFrames; i++) {
      if (this.abortController?.signal.aborted) {
        job.status = 'cancelled';
        this.notifyListeners(job);
        throw new Error('Export cancelled');
      }

      const videoFrame = await renderFrame(i);
      const imageData = await this.videoFrameToImageData(videoFrame);
      videoFrame.close();
      frames.push({ imageData, delayMs });

      job.currentFrame = i + 1;
      job.progress = (i + 1) / job.totalFrames * 0.9;
      const elapsed = Date.now() - job.startTime;
      job.estimatedTimeRemaining = (elapsed / (i + 1)) * (job.totalFrames - i - 1);
      onProgress?.(job.progress, 'Encoding GIF...');
      this.notifyListeners(job);
    }

    job.status = 'muxing';
    onProgress?.(0.95, 'Building GIF...');
    this.notifyListeners(job);

    const gifBytes = encodeGif(frames, { numColors: 256, dither: true, loopCount: 0 });

    job.status = 'complete';
    job.progress = 1;
    const blob = new Blob([gifBytes.buffer as ArrayBuffer], { type: 'image/gif' });
    job.outputPath = URL.createObjectURL(blob);
    onProgress?.(1, 'Complete');
    this.notifyListeners(job);
    return blob;
  }

  private async videoFrameToImageData(frame: VideoFrame): Promise<ImageData> {
    const w = frame.displayWidth, h = frame.displayHeight;
    // Reuse canvas when dimensions are unchanged (common for all frames in a clip).
    // Recreate only on resolution change to avoid per-frame OffscreenCanvas alloc.
    if (!this._gifCanvas || this._gifCanvas.width !== w || this._gifCanvas.height !== h) {
      this._gifCanvas = new OffscreenCanvas(w, h);
      // willReadFrequently: every GIF frame is read back via getImageData.
      const ctx = this._gifCanvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Failed to obtain 2D context from OffscreenCanvas');
      this._gifCtx = ctx;
    }
    this._gifCtx!.drawImage(frame as unknown as CanvasImageSource, 0, 0);
    return this._gifCtx!.getImageData(0, 0, w, h);
  }

  // ============================================================
  // Quick Export
  // ============================================================

  async quickExport(
    frames: VideoFrame[],
    preset: ExportPreset,
    audioBuffer?: AudioBuffer
  ): Promise<Blob> {
    const job = this.createJob('quick', preset.config);
    const duration = frames.length / preset.config.fps;

    return this.export(
      job,
      async (i) => frames[Math.min(i, frames.length - 1)],
      audioBuffer || null,
      duration
    );
  }

  // ============================================================
  // Download
  // ============================================================

  download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * AudioBuffer を再生可能な WAV (audio/wav) として書き出す。
   * WebCodecs 非対応環境や音声/ステム出力のための実フォーマット経路。
   * @param buffer - 書き出す音声
   * @param bitDepth - 16/24 (整数PCM) または 32 (float)。既定 16。
   */
  exportAudioWAV(buffer: AudioBuffer, bitDepth: WavBitDepth = 16): Blob {
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      channels.push(buffer.getChannelData(ch));
    }
    return encodeWAVBlob(channels, { sampleRate: buffer.sampleRate, bitDepth });
  }

  // ============================================================
  // Presets
  // ============================================================

  getPresets(): ExportPreset[] {
    return EXPORT_PRESETS;
  }

  getPresetById(id: string): ExportPreset | undefined {
    return EXPORT_PRESETS.find(p => p.id === id);
  }

  // ============================================================
  // Listeners
  // ============================================================

  subscribe(listener: (job: ExportJob) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(job: ExportJob): void {
    for (const listener of this.listeners) {
      listener(job);
    }
  }
}

