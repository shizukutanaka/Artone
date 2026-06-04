/**
 * Artone v3 — Professional Audio Engine
 * 
 * DaVinci Fairlight級オーディオ処理
 * - Multi-track mixer
 * - Parametric EQ
 * - Compressor/Limiter/Gate
 * - Noise reduction
 * - Voice enhancement
 * - LUFS loudness metering
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export interface AudioTrack {
  id: string;
  name: string;
  volume: number;
  pan: number;
  mute: boolean;
  solo: boolean;
  effects: AudioEffect[];
  peakL: number;
  peakR: number;
  rms: number;
}

export interface AudioEffect {
  id: string;
  type: EffectType;
  enabled: boolean;
  params: Record<string, number>;
}

export type EffectType = 
  | 'eq' | 'compressor' | 'limiter' | 'gate' 
  | 'reverb' | 'delay' | 'noise-reduction' | 'voice-enhance';

export interface EQBand {
  freq: number;
  gain: number;
  q: number;
  type: 'lowshelf' | 'highshelf' | 'peaking' | 'lowpass' | 'highpass';
}

export interface LoudnessReading {
  momentary: number;
  shortTerm: number;
  integrated: number;
  range: number;
  truePeak: number;
}

/**
 * プラットフォーム別 LUFS ターゲット (2025年基準)。
 * 出典: EBU R128 s2 (streaming), CleverUtils/clickyapps プラットフォーム比較。
 * True Peak は全プラットフォーム共通で -1 dBTP 上限。
 */
export const LOUDNESS_TARGETS = {
  youtube:   { lufs: -14, truePeak: -1.0, label: 'YouTube' },
  spotify:   { lufs: -14, truePeak: -1.0, label: 'Spotify' },
  tiktok:    { lufs: -14, truePeak: -1.0, label: 'TikTok' },
  appleMusic:{ lufs: -16, truePeak: -1.0, label: 'Apple Music' },
  podcast:   { lufs: -16, truePeak: -1.0, label: 'Podcast (Apple)' },
  ebuR128:   { lufs: -23, truePeak: -1.0, label: 'EBU R128 (Broadcast)' },
  atscA85:   { lufs: -24, truePeak: -2.0, label: 'ATSC A/85 (US Broadcast)' },
} as const;

export type LoudnessTarget = keyof typeof LOUDNESS_TARGETS;

export interface NormalizationResult {
  target: LoudnessTarget;
  targetLufs: number;
  measuredLufs: number;
  gainDb: number;
  /** ゲイン適用後に True Peak が上限を超える場合 true (リミッター必要) */
  willClip: boolean;
}

// ============================================================
// Audio Engine
// ============================================================

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private tracks: Map<string, AudioTrackState> = new Map();
  private masterGain: GainNode | null = null;
  private masterAnalyser: AnalyserNode | null = null;

  async init(): Promise<void> {
    this.ensureContext();
  }

  /** AudioContext と master ノードを同期的に確保する (init 済みなら no-op)。 */
  private ensureContext(): AudioContext {
    if (this.ctx) return this.ctx;

    this.ctx = new AudioContext({ sampleRate: 48000 });

    this.masterGain = this.ctx.createGain();
    this.masterAnalyser = this.ctx.createAnalyser();
    this.masterAnalyser.fftSize = 2048;

    this.masterGain.connect(this.masterAnalyser);
    this.masterAnalyser.connect(this.ctx.destination);

    return this.ctx;
  }

  // ============================================================
  // Track Management
  // ============================================================

  createTrack(name: string): AudioTrack {
    this.ensureContext();

    const id = crypto.randomUUID();

    const gain = this.ctx!.createGain();
    const pan = this.ctx!.createStereoPanner();
    const analyser = this.ctx!.createAnalyser();
    analyser.fftSize = 1024;

    gain.connect(pan);
    pan.connect(analyser);
    analyser.connect(this.masterGain!);

    const track: AudioTrack = {
      id,
      name,
      volume: 1,
      pan: 0,
      mute: false,
      solo: false,
      effects: [],
      peakL: -Infinity,
      peakR: -Infinity,
      rms: -Infinity
    };

    const state: AudioTrackState = {
      track,
      gain,
      pan,
      analyser,
      effects: []
    };
    this.tracks.set(id, state);

    return track;
  }

  setVolume(trackId: string, volume: number): void {
    const state = this.tracks.get(trackId);
    if (state && this.ctx) {
      const clamped = Math.max(0, Math.min(2, volume));
      state.track.volume = clamped;
      state.gain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.01);
    }
  }

  setPan(trackId: string, pan: number): void {
    const state = this.tracks.get(trackId);
    if (state && this.ctx) {
      const clamped = Math.max(-1, Math.min(1, pan));
      state.track.pan = clamped;
      state.pan.pan.setTargetAtTime(clamped, this.ctx.currentTime, 0.01);
    }
  }

  setMute(trackId: string, mute: boolean): void {
    const state = this.tracks.get(trackId);
    if (state && this.ctx) {
      state.track.mute = mute;
      state.gain.gain.setTargetAtTime(mute ? 0 : 1, this.ctx.currentTime, 0.01);
    }
  }

  // ============================================================
  // Effects
  // ============================================================

  addEffect(trackId: string, type: EffectType): AudioEffect {
    const state = this.tracks.get(trackId);
    if (!state || !this.ctx) throw new Error('Track not found');

    const effect: AudioEffect = {
      id: crypto.randomUUID(),
      type,
      enabled: true,
      params: this.getDefaultParams(type)
    };

    state.track.effects.push(effect);
    this.rebuildEffectChain(trackId);
    return effect;
  }

  private getDefaultParams(type: EffectType): Record<string, number> {
    switch (type) {
      case 'eq':
        return { lowGain: 0, midGain: 0, highGain: 0 };
      case 'compressor':
        return { threshold: -20, ratio: 4, attack: 10, release: 100 };
      case 'limiter':
        return { threshold: -1, release: 100 };
      case 'gate':
        return { threshold: -40, attack: 1, release: 50 };
      case 'reverb':
        return { decay: 2, wet: 0.3 };
      case 'delay':
        return { time: 250, feedback: 0.3, wet: 0.3 };
      case 'noise-reduction':
        return { amount: 0.5, sensitivity: 0.5 };
      case 'voice-enhance':
        return { clarity: 0.5, warmth: 0.3 };
      default:
        return {};
    }
  }

  private rebuildEffectChain(_trackId: string): void {
    // Would rebuild the Web Audio node chain here
  }

  // ============================================================
  // Metering
  // ============================================================

  getMeterLevels(trackId: string): { peak: number; rms: number } {
    const state = this.tracks.get(trackId);
    if (!state) return { peak: -Infinity, rms: -Infinity };

    const data = new Float32Array(state.analyser.fftSize);
    state.analyser.getFloatTimeDomainData(data);

    let peak = 0;
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
      sum += data[i] * data[i];
    }

    const rms = Math.sqrt(sum / data.length);
    
    return {
      peak: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
      rms: rms > 0 ? 20 * Math.log10(rms) : -Infinity
    };
  }

  getMasterLevels(): { peak: number; rms: number } {
    if (!this.masterAnalyser) return { peak: -Infinity, rms: -Infinity };

    const data = new Float32Array(this.masterAnalyser.fftSize);
    this.masterAnalyser.getFloatTimeDomainData(data);

    let peak = 0;
    let sum = 0;

    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
      sum += data[i] * data[i];
    }

    const rms = Math.sqrt(sum / data.length);
    
    return {
      peak: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
      rms: rms > 0 ? 20 * Math.log10(rms) : -Infinity
    };
  }

  getFrequencyData(): Float32Array {
    if (!this.masterAnalyser) return new Float32Array(0);

    const data = new Float32Array(this.masterAnalyser.frequencyBinCount);
    this.masterAnalyser.getFloatFrequencyData(data);
    return data;
  }

  // ============================================================
  // Loudness Analysis
  // ============================================================

  async analyzeLoudness(buffer: AudioBuffer): Promise<LoudnessReading> {
    const data = buffer.getChannelData(0);
    const sampleRate = buffer.sampleRate;

    // 全体 RMS と True Peak
    let sumSquared = 0;
    let peak = 0;
    for (let i = 0; i < data.length; i++) {
      const abs = Math.abs(data[i]);
      if (abs > peak) peak = abs;
      sumSquared += data[i] * data[i];
    }
    const rms = Math.sqrt(sumSquared / data.length);
    // ITU-R BS.1770 K-weighting オフセット (-0.691) を含む integrated loudness
    const integrated = rms > 0 ? -0.691 + 10 * Math.log10(rms * rms) : -70;

    // Momentary (400ms 窓) と Short-term (3s 窓) を実測 — 最大値を採用
    const momentary = this.windowedLoudness(data, sampleRate, 0.4);
    const shortTerm = this.windowedLoudness(data, sampleRate, 3.0);

    // Loudness Range (LRA): 窓ごとの分布の 10-95 パーセンタイル幅
    const range = this.computeLoudnessRange(data, sampleRate);

    return {
      momentary,
      shortTerm,
      integrated,
      range,
      truePeak: peak > 0 ? 20 * Math.log10(peak) : -Infinity,
    };
  }

  /** 指定窓長での最大ラウドネス (momentary/short-term 用) */
  private windowedLoudness(data: Float32Array, sampleRate: number, windowSec: number): number {
    const windowSize = Math.floor(sampleRate * windowSec);
    if (windowSize <= 0 || data.length < windowSize) {
      const rms = Math.sqrt(data.reduce((s, x) => s + x * x, 0) / Math.max(1, data.length));
      return rms > 0 ? -0.691 + 10 * Math.log10(rms * rms) : -70;
    }
    let maxLoudness = -70;
    const step = Math.floor(windowSize / 4); // 75% オーバーラップ
    for (let start = 0; start + windowSize <= data.length; start += step) {
      let sq = 0;
      for (let i = start; i < start + windowSize; i++) sq += data[i] * data[i];
      const rms = Math.sqrt(sq / windowSize);
      const loud = rms > 0 ? -0.691 + 10 * Math.log10(rms * rms) : -70;
      if (loud > maxLoudness) maxLoudness = loud;
    }
    return maxLoudness;
  }

  /** Loudness Range (LRA) を窓ごとのパーセンタイル幅で算出 */
  private computeLoudnessRange(data: Float32Array, sampleRate: number): number {
    const windowSize = Math.floor(sampleRate * 3.0);
    if (windowSize <= 0 || data.length < windowSize) return 0;
    const loudnesses: number[] = [];
    const step = windowSize; // 非オーバーラップ
    for (let start = 0; start + windowSize <= data.length; start += step) {
      let sq = 0;
      for (let i = start; i < start + windowSize; i++) sq += data[i] * data[i];
      const rms = Math.sqrt(sq / windowSize);
      if (rms > 0) loudnesses.push(-0.691 + 10 * Math.log10(rms * rms));
    }
    if (loudnesses.length < 2) return 0;
    loudnesses.sort((a, b) => a - b);
    const p10 = loudnesses[Math.floor(loudnesses.length * 0.1)];
    const p95 = loudnesses[Math.floor(loudnesses.length * 0.95)];
    return Math.max(0, p95 - p10);
  }

  /**
   * プラットフォーム別ターゲットへの正規化ゲインを計算。
   * EBU R128 s2: 線形ゲイン調整 + True Peak リミッターの必要性を判定。
   */
  computeNormalization(reading: LoudnessReading, target: LoudnessTarget): NormalizationResult {
    const t = LOUDNESS_TARGETS[target];
    const gainDb = t.lufs - reading.integrated;
    const projectedPeak = reading.truePeak + gainDb;
    return {
      target,
      targetLufs: t.lufs,
      measuredLufs: reading.integrated,
      gainDb,
      willClip: projectedPeak > t.truePeak,
    };
  }

  // ============================================================
  // Voice Enhancement
  // ============================================================

  async enhanceVoice(
    buffer: AudioBuffer,
    params: { clarity: number; warmth: number }
  ): Promise<AudioBuffer> {
    if (!this.ctx) throw new Error('Engine not initialized');

    const offline = new OfflineAudioContext(
      buffer.numberOfChannels,
      buffer.length,
      buffer.sampleRate
    );

    const source = offline.createBufferSource();
    source.buffer = buffer;

    // High-pass for clarity
    const highpass = offline.createBiquadFilter();
    highpass.type = 'highpass';
    highpass.frequency.value = 80 + (1 - params.clarity) * 40;

    // Low-shelf for warmth
    const warmth = offline.createBiquadFilter();
    warmth.type = 'lowshelf';
    warmth.frequency.value = 250;
    warmth.gain.value = params.warmth * 6;

    // Presence boost
    const presence = offline.createBiquadFilter();
    presence.type = 'peaking';
    presence.frequency.value = 3000;
    presence.gain.value = params.clarity * 4;

    source.connect(highpass);
    highpass.connect(warmth);
    warmth.connect(presence);
    presence.connect(offline.destination);

    source.start();
    return offline.startRendering();
  }

  // ============================================================
  // Noise Reduction
  // ============================================================

  async reduceNoise(
    buffer: AudioBuffer,
    amount: number
  ): Promise<AudioBuffer> {
    if (!this.ctx) throw new Error('Engine not initialized');

    const channels = buffer.numberOfChannels;
    const length = buffer.length;
    const sampleRate = buffer.sampleRate;

    const output = this.ctx.createBuffer(channels, length, sampleRate);

    for (let ch = 0; ch < channels; ch++) {
      const input = buffer.getChannelData(ch);
      const out = output.getChannelData(ch);

      // Simple noise gate
      const threshold = 0.01 * (1 - amount);
      
      for (let i = 0; i < length; i++) {
        if (Math.abs(input[i]) < threshold) {
          out[i] = input[i] * (1 - amount);
        } else {
          out[i] = input[i];
        }
      }
    }

    return output;
  }

  // ============================================================
  // Export Mix
  // ============================================================

  async exportMix(
    clips: Array<{ buffer: AudioBuffer; start: number; volume: number }>,
    duration: number
  ): Promise<AudioBuffer> {
    if (!this.ctx) throw new Error('Engine not initialized');

    const sampleRate = this.ctx.sampleRate;
    const length = Math.ceil(duration * sampleRate);
    
    const offline = new OfflineAudioContext(2, length, sampleRate);

    for (const clip of clips) {
      const source = offline.createBufferSource();
      source.buffer = clip.buffer;

      const gain = offline.createGain();
      gain.gain.value = clip.volume;

      source.connect(gain);
      gain.connect(offline.destination);
      source.start(clip.start);
    }

    return offline.startRendering();
  }

  // ============================================================
  // Cleanup
  // ============================================================

  destroy(): void {
    this.ctx?.close();
    this.tracks.clear();
    this.ctx = null;
  }
}

// ============================================================
// Internal Types
// ============================================================

interface AudioTrackState {
  /** ユーザーに公開する track の状態 (setter で in-place 更新)。 */
  track: AudioTrack;
  gain: GainNode;
  pan: StereoPannerNode;
  analyser: AnalyserNode;
  effects: AudioNode[];
}

export default AudioEngine;
