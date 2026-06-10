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
import { measureLoudness, computeDuckingGain, type DuckingOptions } from './loudness';

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
      // Don't override the muted gain (0); the new volume takes effect on unmute.
      if (!state.track.mute) {
        state.gain.gain.setTargetAtTime(clamped, this.ctx.currentTime, 0.01);
      }
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
      // Unmute must restore the track's volume, not hardcode 1.0 — otherwise a
      // mute/unmute cycle silently overrides any prior setVolume().
      state.gain.gain.setTargetAtTime(mute ? 0 : state.track.volume, this.ctx.currentTime, 0.01);
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
    // ITU-R BS.1770-4 / EBU R128 準拠の測定は audio/loudness.ts に委譲。
    const channels: Float32Array[] = [];
    for (let c = 0; c < buffer.numberOfChannels; c++) {
      channels.push(buffer.getChannelData(c));
    }
    return measureLoudness(channels, buffer.sampleRate);
  }

  /**
   * サイドチェーン(セリフ)に応じて BGM を減衰させるダッキングゲイン包絡を計算する。
   * 返り値は music と同じ長さの線形ゲイン配列 (オフライン適用用)。
   */
  computeDucking(music: Float32Array, sidechain: Float32Array, options: DuckingOptions): Float32Array {
    return computeDuckingGain(music, sidechain, options);
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
    // Drop references to nodes from the now-closed context so the metering
    // getters short-circuit to -Infinity instead of touching dead nodes.
    this.masterGain = null;
    this.masterAnalyser = null;
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
