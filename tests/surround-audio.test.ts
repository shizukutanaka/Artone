/**
 * Tests for audio/surround-audio.ts
 * # AI generated (reviewed)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import SurroundAudioEngine, {
  downmixGainForLabel,
  type ChannelLabel,
  type SurroundPanner,
} from '../audio/surround-audio';

// ============================================================
// Stable AudioBuffer mock (global setup's getChannelData returns a fresh
// array each call, which loses written samples — we need stable arrays).
// ============================================================

function stableBuffer(channelArrays: Float32Array[], sampleRate = 48000): AudioBuffer {
  return {
    numberOfChannels: channelArrays.length,
    length: channelArrays[0]?.length ?? 0,
    sampleRate,
    duration: (channelArrays[0]?.length ?? 0) / sampleRate,
    getChannelData: (ch: number) => channelArrays[ch],
  } as unknown as AudioBuffer;
}

/** A minimal AudioContext whose createBuffer returns stable-array buffers. */
function stableAudioContext(sampleRate = 48000): AudioContext {
  const node = () => ({ connect: vi.fn(), disconnect: vi.fn(), gain: { value: 1 }, frequency: { value: 120 }, type: 'lowpass' });
  return {
    createGain: vi.fn(node),
    createBiquadFilter: vi.fn(node),
    createBuffer: (channels: number, length: number, rate: number) => {
      const arrays = Array.from({ length: channels }, () => new Float32Array(length));
      return stableBuffer(arrays, rate);
    },
    destination: node(),
    sampleRate,
  } as unknown as AudioContext;
}

// ============================================================
// downmixGainForLabel — REGRESSION: per-category gains
// ============================================================

describe('downmixGainForLabel()', () => {
  const config = { centerGain: 0.5, surroundGain: 0.7, lfeGain: 0.3 };

  it('L and R use base gain 1.0 (no category gain)', () => {
    expect(downmixGainForLabel('L', config)).toBe(1);
    expect(downmixGainForLabel('R', config)).toBe(1);
  });

  it('C uses centerGain', () => {
    expect(downmixGainForLabel('C', config)).toBe(0.5);
  });

  it('LFE uses lfeGain', () => {
    expect(downmixGainForLabel('LFE', config)).toBe(0.3);
  });

  it('surround channels use surroundGain', () => {
    for (const l of ['Ls', 'Rs', 'Lrs', 'Rrs'] as ChannelLabel[]) {
      expect(downmixGainForLabel(l, config)).toBe(0.7);
    }
  });

  it('height channels use surroundGain', () => {
    for (const l of ['Ltf', 'Rtf', 'Ltr', 'Rtr'] as ChannelLabel[]) {
      expect(downmixGainForLabel(l, config)).toBe(0.7);
    }
  });

  it('returns 1.0 for all labels except LFE when config is undefined', () => {
    // LFE defaults to excluded (0), matching the ITU-R BS.775 Lo/Ro stereo
    // downmix standard, which does not fold LFE into L/R by default.
    expect(downmixGainForLabel('C')).toBe(1);
    expect(downmixGainForLabel('LFE')).toBe(0);
    expect(downmixGainForLabel('Ls')).toBe(1);
  });

  it('REGRESSION: centerGain no longer leaks onto non-center channels', () => {
    // Before the fix, every channel used centerGain. Now L/R/surround/LFE
    // must NOT pick up centerGain.
    const c = { centerGain: 0.1 };
    expect(downmixGainForLabel('L', c)).toBe(1);
    expect(downmixGainForLabel('Ls', c)).toBe(1); // surroundGain undefined → 1
    expect(downmixGainForLabel('LFE', c)).toBe(0); // lfeGain undefined → 0 (ITU-R BS.775 default)
    expect(downmixGainForLabel('C', c)).toBe(0.1);
  });

  it('REGRESSION: LFE is excluded from stereo downmix by default (ITU-R BS.775)', () => {
    // Before fix: LFE defaulted to full inclusion (gain 1, same as L/R),
    // adding low-frequency energy to every stereo downmix/monitor that
    // ITU-R BS.775's Lo/Ro standard says should not be there.
    expect(downmixGainForLabel('LFE')).toBe(0);
    expect(downmixGainForLabel('LFE', {})).toBe(0);
    expect(downmixGainForLabel('LFE', { centerGain: 0.5 })).toBe(0);
  });

  it('LFE can still be explicitly included via lfeGain (non-standard opt-in)', () => {
    expect(downmixGainForLabel('LFE', { lfeGain: 1 })).toBe(1);
    expect(downmixGainForLabel('LFE', { lfeGain: 0.5 })).toBe(0.5);
  });
});

// ============================================================
// Format management
// ============================================================

describe('SurroundAudioEngine — format management', () => {
  let engine: SurroundAudioEngine;
  beforeEach(() => { engine = new SurroundAudioEngine(new AudioContext()); });

  it('defaults to 5.1 format with 6 channels', () => {
    expect(engine.getFormat()).toBe('5.1');
    expect(engine.getChannels()).toHaveLength(6);
  });

  it('setFormat to 7.1 creates 8 channels', () => {
    engine.setFormat('7.1');
    expect(engine.getChannels()).toHaveLength(8);
  });

  it('setFormat to stereo creates 2 channels', () => {
    engine.setFormat('stereo');
    expect(engine.getChannels()).toHaveLength(2);
  });

  it('7.1.4 creates 12 channels including height', () => {
    engine.setFormat('7.1.4');
    const labels = engine.getChannels().map(c => c.label);
    expect(labels).toContain('Ltf');
    expect(labels).toContain('Rtr');
    expect(engine.getChannels()).toHaveLength(12);
  });

  it('getChannel returns the channel by label', () => {
    expect(engine.getChannel('C')!.name).toBe('Center');
  });
});

// ============================================================
// updateRouting — downmix node lifecycle (leak regression)
// ============================================================

describe('SurroundAudioEngine — updateRouting downmix node lifecycle', () => {
  it('REGRESSION: disconnects the previous downmix nodes on re-route (no AudioNode leak)', () => {
    const ctx = new AudioContext();
    // Constructor calls setFormat('5.1'), which routes into updateRouting()
    // once; monitorFormat defaults to 'stereo', so this already exercises the
    // stereo-downmix branch and creates transient leftGain/rightGain/
    // leftSplit/rightSplit nodes.
    const engine = new SurroundAudioEngine(ctx);
    const createGainSpy = ctx.createGain as unknown as ReturnType<typeof vi.fn>;

    type Internal = {
      channelNodes: Map<string, { disconnect: ReturnType<typeof vi.fn> }>;
      masterNode: { disconnect: ReturnType<typeof vi.fn> };
    };
    const internal = engine as unknown as Internal;
    const persistent = new Set<unknown>([internal.masterNode, ...internal.channelNodes.values()]);

    const createdSoFar = createGainSpy.mock.results.map((r) => r.value);
    const downmixNodesFromFirstRoute = createdSoFar.filter((n) => !persistent.has(n));
    // Sanity check: the downmix branch actually ran and created transient nodes.
    expect(downmixNodesFromFirstRoute.length).toBeGreaterThan(0);
    for (const n of downmixNodesFromFirstRoute as Array<{ disconnect: ReturnType<typeof vi.fn> }>) {
      expect(n.disconnect).not.toHaveBeenCalled();
    }

    // Re-trigger updateRouting()'s downmix branch a second time.
    engine.setMonitorFormat('stereo');

    // Before the fix, updateRouting() only disconnected channelNodes, never
    // the previous call's downmix-only nodes — they stayed connected forever.
    for (const n of downmixNodesFromFirstRoute as Array<{ disconnect: ReturnType<typeof vi.fn> }>) {
      expect(n.disconnect).toHaveBeenCalled();
    }
  });

  it('REGRESSION: live stereo-monitor downmix excludes LFE (ITU-R BS.775)', () => {
    // Before fix: this path used the raw DOWNMIX_51_TO_STEREO matrix for
    // every channel including LFE (0.707/0.707), with no config knob to
    // exclude it — LFE always bled into the live stereo monitor mix.
    const ctx = new AudioContext();
    const engine = new SurroundAudioEngine(ctx); // 5.1: L,R,C,LFE,Ls,Rs (6 channels)

    type Internal = { downmixNodes: unknown[] };
    const internal = engine as unknown as Internal;

    // leftGain+rightGain (2, shared) + leftSplit+rightSplit per non-LFE
    // channel (5 channels × 2 = 10) = 12. Before the fix this was 14
    // (LFE included as a 6th routed channel).
    expect(internal.downmixNodes).toHaveLength(12);
  });
});

// ============================================================
// Channel control
// ============================================================

describe('SurroundAudioEngine — channel control', () => {
  let engine: SurroundAudioEngine;
  beforeEach(() => { engine = new SurroundAudioEngine(new AudioContext()); });

  it('setChannelGain clamps to [0, 2]', () => {
    engine.setChannelGain('L', 5);
    expect(engine.getChannel('L')!.gain).toBe(2);
    engine.setChannelGain('L', -1);
    expect(engine.getChannel('L')!.gain).toBe(0);
  });

  it('setChannelMute sets the muted flag', () => {
    engine.setChannelMute('R', true);
    expect(engine.getChannel('R')!.muted).toBe(true);
  });

  it('setChannelGain ignores unknown labels', () => {
    expect(() => engine.setChannelGain('XYZ' as ChannelLabel, 1)).not.toThrow();
  });

  // ── Click/pop guard (Zenn: rerrah/articles/5b649722ffc3c2) ──
  //
  // Direct `.gain.value = …` on mute/solo creates an instantaneous step in
  // the sample stream, audible as a click. The engine must schedule the
  // change via cancelScheduledValues + setValueAtTime + linearRampToValueAtTime
  // so the transition spans a short ramp (~10ms).

  /** Grab the internal GainNode for a channel via the engine's private map. */
  function nodeFor(eng: SurroundAudioEngine, label: ChannelLabel) {
    const map = (eng as unknown as { channelNodes: Map<string, GainNode> }).channelNodes;
    return map.get(label)!;
  }

  it('REGRESSION: setChannelMute schedules a ramp (no direct gain.value step)', () => {
    const node = nodeFor(engine, 'L');
    engine.setChannelMute('L', true);
    // The click-guard helper always issues all three calls; before the fix the
    // implementation set `.gain.value` directly and never touched the schedule.
    expect(node.gain.cancelScheduledValues).toHaveBeenCalled();
    expect(node.gain.setValueAtTime).toHaveBeenCalled();
    expect(node.gain.linearRampToValueAtTime).toHaveBeenCalled();
    // Final scheduled target reflects the mute (gain → 0).
    const ramp = (node.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(ramp[0]).toBe(0);
  });

  it('soloChannel ramps every other channel to 0 (smooth, not stepped)', () => {
    const nodeR = nodeFor(engine, 'R');
    engine.soloChannel('L');
    expect(nodeR.gain.linearRampToValueAtTime).toHaveBeenCalled();
    const ramp = (nodeR.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(ramp[0]).toBe(0); // non-solo channels duck to silence
  });

  it('setChannelGain schedules a ramp to the new gain value', () => {
    const node = nodeFor(engine, 'C');
    engine.setChannelGain('C', 0.7);
    const ramp = (node.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(ramp[0]).toBeCloseTo(0.7, 5);
  });

  it('unsoloAll ramps each channel back to its prior gain', () => {
    engine.setChannelGain('L', 0.9);
    engine.soloChannel('R');     // L ducked to 0
    const nodeL = nodeFor(engine, 'L');
    (nodeL.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mockClear();
    engine.unsoloAll();
    const ramp = (nodeL.gain.linearRampToValueAtTime as ReturnType<typeof vi.fn>).mock.calls.at(-1)!;
    expect(ramp[0]).toBeCloseTo(0.9, 5); // restored to stored channel gain
  });
});

// ============================================================
// calculatePanGains
// ============================================================

describe('calculatePanGains()', () => {
  let engine: SurroundAudioEngine;
  beforeEach(() => { engine = new SurroundAudioEngine(new AudioContext()); });

  const panner = (over: Partial<SurroundPanner> = {}): SurroundPanner => ({
    x: 0, y: 1, z: 0, spread: 0.5, divergence: 1, lfeAmount: 0.5, ...over,
  });

  it('returns a gain for every channel', () => {
    const gains = engine.calculatePanGains(panner());
    expect(gains.size).toBe(engine.getChannels().length);
  });

  it('LFE gain equals lfeAmount', () => {
    const gains = engine.calculatePanGains(panner({ lfeAmount: 0.42 }));
    expect(gains.get('LFE')).toBeCloseTo(0.42);
  });

  it('all gains are finite and non-negative', () => {
    const gains = engine.calculatePanGains(panner({ x: 0.3, y: -0.7, z: 0.2 }));
    for (const g of gains.values()) {
      expect(Number.isFinite(g)).toBe(true);
      expect(g).toBeGreaterThanOrEqual(0);
    }
  });

  it('front-panned source gives front channels more gain than rear', () => {
    // y=1 → front. Compare L (front, -30°) vs Ls (surround, -110°)
    const gains = engine.calculatePanGains(panner({ x: -0.5, y: 1 }));
    expect(gains.get('L')!).toBeGreaterThan(gains.get('Ls')!);
  });
});

// ============================================================
// createDownmix — REGRESSION integration test
// ============================================================

describe('createDownmix()', () => {
  it('downmixes 5.1 to stereo applying per-category gains', () => {
    const ctx = stableAudioContext();
    const engine = new SurroundAudioEngine(ctx);

    // Each source channel is a constant 1.0 signal of length 4.
    const len = 4;
    const src = new Map<ChannelLabel, AudioBuffer>();
    for (const label of ['L', 'R', 'C', 'LFE', 'Ls', 'Rs'] as ChannelLabel[]) {
      src.set(label, stableBuffer([new Float32Array(len).fill(1)]));
    }

    const out = engine.createDownmix(src, 'stereo', {
      format: 'stereo', centerGain: 0.5, surroundGain: 0.7, lfeGain: 0.3, loPass: 120,
    });

    expect(out).toHaveLength(2);
    const left = out[0].getChannelData(0);

    // Left = L*1*1 + C*0.707*0.5 + LFE*0.707*0.3 + Ls*0.707*0.7
    //      = 1 + 0.3535 + 0.2121 + 0.4949 = 2.0605
    const expectedLeft = 1 + 0.707 * 0.5 + 0.707 * 0.3 + 0.707 * 0.7;
    expect(left[0]).toBeCloseTo(expectedLeft, 3);
  });

  it('REGRESSION: surroundGain/lfeGain actually affect the output', () => {
    const ctx = stableAudioContext();
    const engine = new SurroundAudioEngine(ctx);
    const len = 2;
    const src = new Map<ChannelLabel, AudioBuffer>();
    src.set('Ls', stableBuffer([new Float32Array(len).fill(1)]));

    const lowSurround = engine.createDownmix(src, 'stereo', {
      format: 'stereo', centerGain: 1, surroundGain: 0.1, lfeGain: 1, loPass: 120,
    });
    const highSurround = engine.createDownmix(src, 'stereo', {
      format: 'stereo', centerGain: 1, surroundGain: 1, lfeGain: 1, loPass: 120,
    });

    // Ls maps to left only (0.707). Higher surroundGain → larger left output.
    expect(highSurround[0].getChannelData(0)[0]).toBeGreaterThan(
      lowSurround[0].getChannelData(0)[0]
    );
  });

  it('defaults to gain 1.0 when no config provided', () => {
    const ctx = stableAudioContext();
    const engine = new SurroundAudioEngine(ctx);
    const src = new Map<ChannelLabel, AudioBuffer>();
    src.set('L', stableBuffer([new Float32Array(2).fill(1)]));
    const out = engine.createDownmix(src, 'stereo');
    expect(out[0].getChannelData(0)[0]).toBeCloseTo(1); // L → left * 1
  });
});

// ============================================================
// getChannelLevels
// ============================================================

describe('getChannelLevels()', () => {
  let engine: SurroundAudioEngine;
  beforeEach(() => { engine = new SurroundAudioEngine(new AudioContext()); });

  it('returns 0 for every channel when no buffer given', () => {
    const levels = engine.getChannelLevels();
    for (const v of levels.values()) expect(v).toBe(0);
  });

  it('computes RMS for provided channels', () => {
    // Channel 0 = constant 1.0 → RMS 1.0; others absent → 0.
    const buf = stableBuffer([new Float32Array(100).fill(1)]);
    const levels = engine.getChannelLevels(buf);
    const labels = engine.getChannels().map(c => c.label);
    expect(levels.get(labels[0])).toBeCloseTo(1);
    expect(levels.get(labels[1])).toBe(0); // beyond buffer channels
  });

  it('RMS of a known signal is correct', () => {
    // [1, -1, 1, -1] → RMS = sqrt(mean of 1s) = 1
    const buf = stableBuffer([new Float32Array([1, -1, 1, -1])]);
    const levels = engine.getChannelLevels(buf);
    const firstLabel = engine.getChannels()[0].label;
    expect(levels.get(firstLabel)).toBeCloseTo(1);
  });
});

// ============================================================
// LFE crossover
// ============================================================

describe('LFE crossover', () => {
  let engine: SurroundAudioEngine;
  beforeEach(() => { engine = new SurroundAudioEngine(new AudioContext()); });

  it('setLFECrossover clamps to [20, 200]', () => {
    engine.setLFECrossover(5);
    expect(engine.getLFECrossover()).toBe(20);
    engine.setLFECrossover(500);
    expect(engine.getLFECrossover()).toBe(200);
  });

  it('setLFECrossover accepts in-range value', () => {
    engine.setLFECrossover(80);
    expect(engine.getLFECrossover()).toBe(80);
  });
});

// ============================================================
// applyMixPreset
// ============================================================

describe('applyMixPreset()', () => {
  let engine: SurroundAudioEngine;
  beforeEach(() => { engine = new SurroundAudioEngine(new AudioContext()); });

  it('film preset sets full surround gains', () => {
    engine.applyMixPreset('film');
    expect(engine.getChannel('C')!.gain).toBeCloseTo(1);
    expect(engine.getChannel('Ls')!.gain).toBeCloseTo(0.8);
  });

  it('dialogue preset boosts center', () => {
    engine.applyMixPreset('dialogue');
    expect(engine.getChannel('C')!.gain).toBeGreaterThan(engine.getChannel('L')!.gain);
  });
});

// ============================================================
// Subscribe
// ============================================================

describe('subscribe()', () => {
  it('listener notified on channel gain change', () => {
    const engine = new SurroundAudioEngine(new AudioContext());
    const fn = vi.fn();
    engine.subscribe(fn);
    engine.setChannelGain('L', 0.5);
    expect(fn).toHaveBeenCalled();
  });

  it('unsubscribe stops notifications', () => {
    const engine = new SurroundAudioEngine(new AudioContext());
    const fn = vi.fn();
    const unsub = engine.subscribe(fn);
    unsub();
    engine.setChannelGain('L', 0.5);
    expect(fn).not.toHaveBeenCalled();
  });
});
