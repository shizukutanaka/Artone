/**
 * Artone v3 — Surround Audio System
 * 
 * サラウンドオーディオ
 * - 5.1/7.1チャンネル
 * - 空間パンニング
 * - ダウンミックス
 * - モニタリング
 * - LFE管理
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export type SurroundFormat = 'stereo' | '5.1' | '7.1' | '5.1.2' | '7.1.4';

export interface SurroundChannel {
  id: string;
  name: string;
  label: ChannelLabel;
  angle: number;        // Degrees from center (0 = front)
  elevation: number;    // Degrees vertical (-90 to 90)
  gain: number;         // 0-1
  muted: boolean;
}

export type ChannelLabel = 
  | 'L' | 'R' | 'C' | 'LFE' | 'Ls' | 'Rs'  // 5.1
  | 'Lrs' | 'Rrs'                           // 7.1
  | 'Ltf' | 'Rtf' | 'Ltr' | 'Rtr';          // Atmos

export interface SurroundPanner {
  x: number;            // -1 (left) to 1 (right)
  y: number;            // -1 (back) to 1 (front)
  z: number;            // -1 (below) to 1 (above)
  spread: number;       // 0-1 (point source to full)
  divergence: number;   // Center distribution 0-1
  lfeAmount: number;    // LFE send 0-1
}

export interface DownmixConfig {
  format: SurroundFormat;
  centerGain: number;
  surroundGain: number;
  lfeGain: number;
  loPass: number;       // LFE low pass frequency
}

// ============================================================
// Channel Configurations
// ============================================================

const CHANNEL_CONFIGS: Record<SurroundFormat, Omit<SurroundChannel, 'id' | 'gain' | 'muted'>[]> = {
  'stereo': [
    { name: 'Left', label: 'L', angle: -30, elevation: 0 },
    { name: 'Right', label: 'R', angle: 30, elevation: 0 }
  ],
  '5.1': [
    { name: 'Left', label: 'L', angle: -30, elevation: 0 },
    { name: 'Right', label: 'R', angle: 30, elevation: 0 },
    { name: 'Center', label: 'C', angle: 0, elevation: 0 },
    { name: 'LFE', label: 'LFE', angle: 0, elevation: -30 },
    { name: 'Left Surround', label: 'Ls', angle: -110, elevation: 0 },
    { name: 'Right Surround', label: 'Rs', angle: 110, elevation: 0 }
  ],
  '7.1': [
    { name: 'Left', label: 'L', angle: -30, elevation: 0 },
    { name: 'Right', label: 'R', angle: 30, elevation: 0 },
    { name: 'Center', label: 'C', angle: 0, elevation: 0 },
    { name: 'LFE', label: 'LFE', angle: 0, elevation: -30 },
    { name: 'Left Surround', label: 'Ls', angle: -90, elevation: 0 },
    { name: 'Right Surround', label: 'Rs', angle: 90, elevation: 0 },
    { name: 'Left Rear Surround', label: 'Lrs', angle: -150, elevation: 0 },
    { name: 'Right Rear Surround', label: 'Rrs', angle: 150, elevation: 0 }
  ],
  '5.1.2': [
    { name: 'Left', label: 'L', angle: -30, elevation: 0 },
    { name: 'Right', label: 'R', angle: 30, elevation: 0 },
    { name: 'Center', label: 'C', angle: 0, elevation: 0 },
    { name: 'LFE', label: 'LFE', angle: 0, elevation: -30 },
    { name: 'Left Surround', label: 'Ls', angle: -110, elevation: 0 },
    { name: 'Right Surround', label: 'Rs', angle: 110, elevation: 0 },
    { name: 'Left Top Front', label: 'Ltf', angle: -30, elevation: 45 },
    { name: 'Right Top Front', label: 'Rtf', angle: 30, elevation: 45 }
  ],
  '7.1.4': [
    { name: 'Left', label: 'L', angle: -30, elevation: 0 },
    { name: 'Right', label: 'R', angle: 30, elevation: 0 },
    { name: 'Center', label: 'C', angle: 0, elevation: 0 },
    { name: 'LFE', label: 'LFE', angle: 0, elevation: -30 },
    { name: 'Left Surround', label: 'Ls', angle: -90, elevation: 0 },
    { name: 'Right Surround', label: 'Rs', angle: 90, elevation: 0 },
    { name: 'Left Rear Surround', label: 'Lrs', angle: -150, elevation: 0 },
    { name: 'Right Rear Surround', label: 'Rrs', angle: 150, elevation: 0 },
    { name: 'Left Top Front', label: 'Ltf', angle: -30, elevation: 45 },
    { name: 'Right Top Front', label: 'Rtf', angle: 30, elevation: 45 },
    { name: 'Left Top Rear', label: 'Ltr', angle: -110, elevation: 45 },
    { name: 'Right Top Rear', label: 'Rtr', angle: 110, elevation: 45 }
  ]
};

// ============================================================
// Downmix Matrices
// ============================================================

const DOWNMIX_51_TO_STEREO: Record<ChannelLabel, [number, number]> = {
  'L': [1, 0],
  'R': [0, 1],
  'C': [0.707, 0.707],
  'LFE': [0.707, 0.707],
  'Ls': [0.707, 0],
  'Rs': [0, 0.707],
  'Lrs': [0.5, 0],
  'Rrs': [0, 0.5],
  'Ltf': [0.5, 0],
  'Rtf': [0, 0.5],
  'Ltr': [0.35, 0],
  'Rtr': [0, 0.35]
};

// ============================================================
// Surround Audio Engine
// ============================================================

export class SurroundAudioEngine {
  private audioContext: AudioContext;
  private format: SurroundFormat = '5.1';
  private channels: Map<string, SurroundChannel> = new Map();
  private channelNodes: Map<string, GainNode> = new Map();
  private masterNode: GainNode;
  private lfeFilter: BiquadFilterNode;
  private monitorFormat: SurroundFormat = 'stereo';
  private listeners: Set<() => void> = new Set();

  constructor(audioContext: AudioContext) {
    this.audioContext = audioContext;
    this.masterNode = audioContext.createGain();
    this.masterNode.connect(audioContext.destination);
    
    this.lfeFilter = audioContext.createBiquadFilter();
    this.lfeFilter.type = 'lowpass';
    this.lfeFilter.frequency.value = 120;
    
    this.setFormat('5.1');
  }

  // ============================================================
  // Format Management
  // ============================================================

  setFormat(format: SurroundFormat): void {
    this.format = format;
    this.channels.clear();
    
    // Disconnect existing nodes
    for (const node of this.channelNodes.values()) {
      node.disconnect();
    }
    this.channelNodes.clear();

    // Create new channels
    const config = CHANNEL_CONFIGS[format];
    for (const ch of config) {
      const channel: SurroundChannel = {
        ...ch,
        id: crypto.randomUUID(),
        gain: 1,
        muted: false
      };

      this.channels.set(channel.label, channel);

      // Create gain node
      const gainNode = this.audioContext.createGain();
      gainNode.gain.value = 1;
      this.channelNodes.set(channel.label, gainNode);
    }

    this.updateRouting();
    this.notify();
  }

  getFormat(): SurroundFormat {
    return this.format;
  }

  getChannels(): SurroundChannel[] {
    return Array.from(this.channels.values());
  }

  getChannel(label: ChannelLabel): SurroundChannel | undefined {
    return this.channels.get(label);
  }

  // ============================================================
  // Channel Control
  // ============================================================

  setChannelGain(label: ChannelLabel, gain: number): void {
    const channel = this.channels.get(label);
    const node = this.channelNodes.get(label);
    
    if (channel && node) {
      channel.gain = Math.max(0, Math.min(2, gain));
      node.gain.value = channel.muted ? 0 : channel.gain;
      this.notify();
    }
  }

  setChannelMute(label: ChannelLabel, muted: boolean): void {
    const channel = this.channels.get(label);
    const node = this.channelNodes.get(label);
    
    if (channel && node) {
      channel.muted = muted;
      node.gain.value = muted ? 0 : channel.gain;
      this.notify();
    }
  }

  soloChannel(label: ChannelLabel): void {
    for (const [l, channel] of this.channels) {
      const node = this.channelNodes.get(l);
      if (node) {
        const isSolo = l === label;
        node.gain.value = isSolo ? channel.gain : 0;
      }
    }
    this.notify();
  }

  unsoloAll(): void {
    for (const [label, channel] of this.channels) {
      const node = this.channelNodes.get(label);
      if (node) {
        node.gain.value = channel.muted ? 0 : channel.gain;
      }
    }
    this.notify();
  }

  // ============================================================
  // Spatial Panning
  // ============================================================

  calculatePanGains(panner: SurroundPanner): Map<ChannelLabel, number> {
    const gains = new Map<ChannelLabel, number>();
    
    for (const channel of this.channels.values()) {
      // Convert panner position to angle
      const panAngle = Math.atan2(panner.x, panner.y) * (180 / Math.PI);
      const panElevation = panner.z * 90;
      
      // Calculate angular distance
      let angleDiff = Math.abs(channel.angle - panAngle);
      if (angleDiff > 180) angleDiff = 360 - angleDiff;
      
      const elevDiff = Math.abs(channel.elevation - panElevation);
      
      // Combined distance
      const distance = Math.sqrt(angleDiff * angleDiff + elevDiff * elevDiff);
      
      // Calculate gain based on distance and spread
      const spreadFactor = 90 + panner.spread * 90; // 90-180 degrees
      let gain = Math.max(0, 1 - (distance / spreadFactor));
      
      // Apply power panning
      gain = Math.pow(gain, 0.5);
      
      // Special handling for LFE
      if (channel.label === 'LFE') {
        gain = panner.lfeAmount;
      }
      
      // Special handling for center
      if (channel.label === 'C') {
        const centerAmount = panner.divergence;
        gain = gain * centerAmount;
      }
      
      gains.set(channel.label, gain);
    }
    
    // Normalize gains
    const total = Array.from(gains.values()).reduce((sum, g) => sum + g * g, 0);
    const normalizer = total > 0 ? 1 / Math.sqrt(total) : 1;
    
    for (const [label, gain] of gains) {
      if (label !== 'LFE') {
        gains.set(label, gain * normalizer);
      }
    }
    
    return gains;
  }

  // ============================================================
  // Monitoring
  // ============================================================

  setMonitorFormat(format: SurroundFormat): void {
    this.monitorFormat = format;
    this.updateRouting();
    this.notify();
  }

  getMonitorFormat(): SurroundFormat {
    return this.monitorFormat;
  }

  private updateRouting(): void {
    // Disconnect all
    for (const node of this.channelNodes.values()) {
      node.disconnect();
    }

    if (this.format === this.monitorFormat) {
      // Direct connection
      for (const node of this.channelNodes.values()) {
        node.connect(this.masterNode);
      }
    } else if (this.monitorFormat === 'stereo') {
      // Downmix to stereo
      const leftGain = this.audioContext.createGain();
      const rightGain = this.audioContext.createGain();
      
      leftGain.connect(this.masterNode);
      rightGain.connect(this.masterNode);
      
      for (const [label, node] of this.channelNodes) {
        const matrix = DOWNMIX_51_TO_STEREO[label as ChannelLabel];
        if (matrix) {
          const leftSplit = this.audioContext.createGain();
          const rightSplit = this.audioContext.createGain();
          
          leftSplit.gain.value = matrix[0];
          rightSplit.gain.value = matrix[1];
          
          node.connect(leftSplit);
          node.connect(rightSplit);
          leftSplit.connect(leftGain);
          rightSplit.connect(rightGain);
        }
      }
    }
  }

  // ============================================================
  // Downmix
  // ============================================================

  createDownmix(
    sourceBuffers: Map<ChannelLabel, AudioBuffer>,
    targetFormat: SurroundFormat,
    config?: Partial<DownmixConfig>
  ): AudioBuffer[] {
    const targetChannels = CHANNEL_CONFIGS[targetFormat].length;
    const length = sourceBuffers.values().next().value?.length || 0;
    const sampleRate = this.audioContext.sampleRate;

    const outputBuffers: AudioBuffer[] = [];
    
    for (let i = 0; i < targetChannels; i++) {
      outputBuffers.push(this.audioContext.createBuffer(1, length, sampleRate));
    }

    // Apply downmix matrix
    if (targetFormat === 'stereo') {
      const leftData = outputBuffers[0].getChannelData(0);
      const rightData = outputBuffers[1].getChannelData(0);

      for (const [label, buffer] of sourceBuffers) {
        const matrix = DOWNMIX_51_TO_STEREO[label];
        if (!matrix) continue;

        const sourceData = buffer.getChannelData(0);
        const leftGain = matrix[0] * (config?.centerGain ?? 1);
        const rightGain = matrix[1] * (config?.centerGain ?? 1);

        for (let i = 0; i < length; i++) {
          leftData[i] += sourceData[i] * leftGain;
          rightData[i] += sourceData[i] * rightGain;
        }
      }
    }

    return outputBuffers;
  }

  // ============================================================
  // LFE Management
  // ============================================================

  setLFECrossover(frequency: number): void {
    this.lfeFilter.frequency.value = Math.max(20, Math.min(200, frequency));
    this.notify();
  }

  getLFECrossover(): number {
    return this.lfeFilter.frequency.value;
  }

  extractLFE(buffer: AudioBuffer): AudioBuffer {
    const outputBuffer = this.audioContext.createBuffer(
      1,
      buffer.length,
      buffer.sampleRate
    );

    // Simple low-pass filter simulation
    const cutoff = this.lfeFilter.frequency.value;
    const rc = 1 / (2 * Math.PI * cutoff);
    const dt = 1 / buffer.sampleRate;
    const alpha = dt / (rc + dt);

    for (let ch = 0; ch < buffer.numberOfChannels; ch++) {
      const input = buffer.getChannelData(ch);
      const output = outputBuffer.getChannelData(0);

      let prev = 0;
      for (let i = 0; i < input.length; i++) {
        prev = prev + alpha * (input[i] - prev);
        output[i] += prev / buffer.numberOfChannels;
      }
    }

    return outputBuffer;
  }

  // ============================================================
  // Metering
  // ============================================================

  getChannelLevels(): Map<ChannelLabel, number> {
    const levels = new Map<ChannelLabel, number>();
    
    for (const channel of this.channels.values()) {
      // Would use AnalyserNode in real implementation
      levels.set(channel.label, Math.random() * 0.8); // Simulated
    }
    
    return levels;
  }

  // ============================================================
  // Presets
  // ============================================================

  applyMixPreset(preset: 'music' | 'film' | 'dialogue' | 'broadcast'): void {
    const presets: Record<string, Partial<Record<ChannelLabel, number>>> = {
      music: { L: 1, R: 1, C: 0.8, LFE: 0.6, Ls: 0.5, Rs: 0.5 },
      film: { L: 1, R: 1, C: 1, LFE: 1, Ls: 0.8, Rs: 0.8 },
      dialogue: { L: 0.8, R: 0.8, C: 1.2, LFE: 0.3, Ls: 0.4, Rs: 0.4 },
      broadcast: { L: 1, R: 1, C: 1, LFE: 0.5, Ls: 0.6, Rs: 0.6 }
    };

    const gains = presets[preset];
    if (gains) {
      for (const [label, gain] of Object.entries(gains)) {
        this.setChannelGain(label as ChannelLabel, gain);
      }
    }
  }

  // ============================================================
  // Listeners
  // ============================================================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export default SurroundAudioEngine;
