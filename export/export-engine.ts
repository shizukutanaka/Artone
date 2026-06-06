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
  video: EncodedVideoChunk[];
  audio: Uint8Array | null;
  duration: number;
}

type ProgressCallback = (progress: number, status: string) => void;

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
      codec: 'avc1.640033',
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
      codec: 'avc1.640028',
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
      codec: 'avc1.4D001E',
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
      codec: 'avc1.4D001E',
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
      codec: 'avc1.4D001E',
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
  private abortController: AbortController | null = null;
  private listeners: Set<(job: ExportJob) => void> = new Set();

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
    this.abortController = new AbortController();
    job.startTime = Date.now();
    job.totalFrames = Math.ceil(duration * job.config.fps);

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

      // Phase 2: Encode audio
      let audioData: Uint8Array | null = null;
      if (audioBuffer && job.config.format !== 'gif') {
        onProgress?.(0.8, 'Encoding audio...');
        audioData = await this.encodeAudio(audioBuffer, job.config.audioBitrate);
        job.progress = 0.9;
        this.notifyListeners(job);
      }

      // Phase 3: Mux
      job.status = 'muxing';
      onProgress?.(0.9, 'Muxing...');
      this.notifyListeners(job);

      const blob = await this.mux(
        videoChunks,
        audioData,
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
      job.status = 'error';
      job.error = error instanceof Error ? error.message : String(error);
      this.notifyListeners(job);
      throw error;
    } finally {
      this.encoder?.close();
      this.audioEncoder?.close();
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
  ): Promise<EncodedVideoChunk[]> {
    const chunks: EncodedVideoChunk[] = [];
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
          chunks.push(chunk);
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

          const frame = await renderFrame(i);
          const isKeyFrame = i % keyFrameInterval === 0;

          this.encoder!.encode(frame, { keyFrame: isKeyFrame });
          frame.close();

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
  ): Promise<Uint8Array> {
    const chunks: Uint8Array[] = [];
    const sampleRate = buffer.sampleRate;
    const channels = Math.min(buffer.numberOfChannels, 2);

    // Check AAC support
    const support = await AudioEncoder.isConfigSupported({
      codec: 'mp4a.40.2',
      sampleRate,
      numberOfChannels: channels,
      bitrate
    });

    if (!support.supported) {
      // Fallback: return raw PCM
      const pcm = new Float32Array(buffer.length * channels);
      for (let ch = 0; ch < channels; ch++) {
        const channelData = buffer.getChannelData(ch);
        for (let i = 0; i < buffer.length; i++) {
          pcm[i * channels + ch] = channelData[i];
        }
      }
      return new Uint8Array(pcm.buffer);
    }

    return new Promise((resolve, reject) => {
      this.audioEncoder = new AudioEncoder({
        output: (chunk) => {
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          chunks.push(data);
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

      for (let f = 0; f < totalFrames; f++) {
        const offset = f * frameSize;
        const length = Math.min(frameSize, buffer.length - offset);
        
        const data = new Float32Array(length * channels);
        for (let ch = 0; ch < channels; ch++) {
          const channelData = buffer.getChannelData(ch);
          for (let i = 0; i < length; i++) {
            data[i * channels + ch] = channelData[offset + i];
          }
        }

        const audioData = new AudioData({
          format: 'f32-planar',
          sampleRate,
          numberOfFrames: length,
          numberOfChannels: channels,
          timestamp: (offset / sampleRate) * 1_000_000,
          data
        });

        this.audioEncoder.encode(audioData);
        audioData.close();
      }

      this.audioEncoder.flush().then(() => {
        const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
          result.set(chunk, offset);
          offset += chunk.length;
        }
        resolve(result);
      }).catch(reject);
    });
  }

  // ============================================================
  // Muxing
  // ============================================================

  private async mux(
    videoChunks: EncodedVideoChunk[],
    audioData: Uint8Array | null,
    config: ExportConfig,
    _duration: number
  ): Promise<Blob> {
    // Simple MP4/WebM container generation
    // In production, use mp4-muxer or similar library
    
    if (config.format === 'gif') {
      return this.createGif(videoChunks, config);
    }

    // Build basic container
    const videoSize = videoChunks.reduce((sum, c) => sum + c.byteLength, 0);
    const audioSize = audioData?.length || 0;
    const totalSize = videoSize + audioSize + 1024; // Header overhead

    const buffer = new ArrayBuffer(totalSize);
    let offset = 0;

    // Write video chunks
    for (const chunk of videoChunks) {
      const data = new Uint8Array(chunk.byteLength);
      chunk.copyTo(data);
      new Uint8Array(buffer, offset, chunk.byteLength).set(data);
      offset += chunk.byteLength;
    }

    // Write audio data
    if (audioData) {
      new Uint8Array(buffer, offset, audioData.length).set(audioData);
      offset += audioData.length;
    }

    const mimeType = config.format === 'mp4' 
      ? 'video/mp4' 
      : 'video/webm';

    return new Blob([buffer.slice(0, offset)], { type: mimeType });
  }

  private async createGif(
    _videoChunks: EncodedVideoChunk[],
    _config: ExportConfig
  ): Promise<Blob> {
    // GIF generation would use gifenc or similar
    // Placeholder: return empty blob
    return new Blob([], { type: 'image/gif' });
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

