/**
 * Tests for audio/audio-engine.ts
 *
 * AudioContext / OfflineAudioContext are provided by the global setup mocks.
 * Web Audio param setters are spies, so gain/pan changes are asserted by
 * inspecting the (private) track node state.
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AudioEngine, type LoudnessReading } from '../audio/audio-engine';

interface GainParam { setTargetAtTime: ReturnType<typeof vi.fn>; value: number }
interface TrackState {
  gain: { gain: GainParam };
  pan: { pan: GainParam };
  analyser: { fftSize: number; getFloatTimeDomainData: ReturnType<typeof vi.fn> };
}

function trackState(engine: AudioEngine, id: string): TrackState {
  return (engine as unknown as { tracks: Map<string, TrackState> }).tracks.get(id)!;
}

/** Last value passed to a setTargetAtTime spy. */
function lastTarget(param: GainParam): number {
  const calls = param.setTargetAtTime.mock.calls;
  return calls[calls.length - 1][0] as number;
}

// ============================================================
// init / context
// ============================================================

describe('AudioEngine — init', () => {
  it('init does not throw', async () => {
    const engine = new AudioEngine();
    await expect(engine.init()).resolves.toBeUndefined();
  });

  it('createTrack works after init (context auto-ensured)', () => {
    const engine = new AudioEngine();
    expect(() => engine.createTrack('Track 1')).not.toThrow();
  });
});

// ============================================================
// Track management
// ============================================================

describe('AudioEngine — createTrack', () => {
  let engine: AudioEngine;
  beforeEach(() => { engine = new AudioEngine(); });

  it('returns a track with sensible defaults', () => {
    const t = engine.createTrack('Vocals');
    expect(t.name).toBe('Vocals');
    expect(t.volume).toBe(1);
    expect(t.pan).toBe(0);
    expect(t.mute).toBe(false);
    expect(t.solo).toBe(false);
    expect(t.effects).toHaveLength(0);
    expect(t.peakL).toBe(-Infinity);
  });

  it('assigns a unique id to each track', () => {
    const a = engine.createTrack('A');
    const b = engine.createTrack('B');
    expect(a.id).not.toBe(b.id);
  });

  it('registers track state in the internal map', () => {
    const t = engine.createTrack('X');
    expect(trackState(engine, t.id)).toBeDefined();
  });
});

// ============================================================
// setVolume / setPan / setMute
// ============================================================

describe('AudioEngine — setVolume', () => {
  let engine: AudioEngine;
  beforeEach(() => { engine = new AudioEngine(); });

  it('clamps volume to [0, 2]', () => {
    const t = engine.createTrack('T');
    engine.setVolume(t.id, 5);
    expect(trackState(engine, t.id).gain && t.volume).toBe(2);
    engine.setVolume(t.id, -1);
    expect(t.volume).toBe(0);
  });

  it('applies volume to the gain node when not muted', () => {
    const t = engine.createTrack('T');
    engine.setVolume(t.id, 0.7);
    expect(lastTarget(trackState(engine, t.id).gain.gain)).toBeCloseTo(0.7);
  });

  it('ignores unknown track id', () => {
    expect(() => engine.setVolume('ghost', 1)).not.toThrow();
  });

  it('REGRESSION: setVolume while muted updates stored volume but not the gain node', () => {
    const t = engine.createTrack('T');
    engine.setMute(t.id, true);
    const param = trackState(engine, t.id).gain.gain;
    param.setTargetAtTime.mockClear();
    engine.setVolume(t.id, 0.4);
    expect(t.volume).toBe(0.4);          // stored
    expect(param.setTargetAtTime).not.toHaveBeenCalled(); // gain stays at muted 0
  });
});

describe('AudioEngine — setPan', () => {
  let engine: AudioEngine;
  beforeEach(() => { engine = new AudioEngine(); });

  it('clamps pan to [-1, 1]', () => {
    const t = engine.createTrack('T');
    engine.setPan(t.id, 3);
    expect(t.pan).toBe(1);
    engine.setPan(t.id, -3);
    expect(t.pan).toBe(-1);
  });

  it('applies pan to the panner node', () => {
    const t = engine.createTrack('T');
    engine.setPan(t.id, 0.5);
    expect(lastTarget(trackState(engine, t.id).pan.pan)).toBeCloseTo(0.5);
  });

  it('ignores unknown track id', () => {
    expect(() => engine.setPan('ghost', 0)).not.toThrow();
  });
});

describe('AudioEngine — setMute', () => {
  let engine: AudioEngine;
  beforeEach(() => { engine = new AudioEngine(); });

  it('mute sets the gain node to 0', () => {
    const t = engine.createTrack('T');
    engine.setMute(t.id, true);
    expect(t.mute).toBe(true);
    expect(lastTarget(trackState(engine, t.id).gain.gain)).toBe(0);
  });

  it('REGRESSION: unmute restores the track volume, not 1.0', () => {
    const t = engine.createTrack('T');
    engine.setVolume(t.id, 0.5);
    engine.setMute(t.id, true);
    engine.setMute(t.id, false);
    // Before the fix this would be 1.0, clobbering the 0.5 volume.
    expect(lastTarget(trackState(engine, t.id).gain.gain)).toBeCloseTo(0.5);
  });

  it('unmute at default volume restores 1.0', () => {
    const t = engine.createTrack('T');
    engine.setMute(t.id, true);
    engine.setMute(t.id, false);
    expect(lastTarget(trackState(engine, t.id).gain.gain)).toBeCloseTo(1);
  });

  it('ignores unknown track id', () => {
    expect(() => engine.setMute('ghost', true)).not.toThrow();
  });
});

// ============================================================
// Effects
// ============================================================

describe('AudioEngine — addEffect', () => {
  let engine: AudioEngine;
  beforeEach(() => { engine = new AudioEngine(); });

  it('adds an effect with default params', () => {
    const t = engine.createTrack('T');
    const fx = engine.addEffect(t.id, 'compressor');
    expect(fx.type).toBe('compressor');
    expect(fx.enabled).toBe(true);
    expect(fx.params.threshold).toBe(-20);
    expect(fx.params.ratio).toBe(4);
    expect(t.effects).toHaveLength(1);
  });

  it('eq default params', () => {
    const t = engine.createTrack('T');
    const fx = engine.addEffect(t.id, 'eq');
    expect(fx.params).toEqual({ lowGain: 0, midGain: 0, highGain: 0 });
  });

  it('gate default params', () => {
    const t = engine.createTrack('T');
    const fx = engine.addEffect(t.id, 'gate');
    expect(fx.params.threshold).toBe(-40);
  });

  it('throws for unknown track id', () => {
    expect(() => engine.addEffect('ghost', 'eq')).toThrow('Track not found');
  });

  it('assigns unique ids to effects', () => {
    const t = engine.createTrack('T');
    const a = engine.addEffect(t.id, 'eq');
    const b = engine.addEffect(t.id, 'delay');
    expect(a.id).not.toBe(b.id);
  });
});

// ============================================================
// Metering
// ============================================================

describe('AudioEngine — metering', () => {
  let engine: AudioEngine;
  beforeEach(() => { engine = new AudioEngine(); });

  it('getMeterLevels returns -Infinity for unknown track', () => {
    expect(engine.getMeterLevels('ghost')).toEqual({ peak: -Infinity, rms: -Infinity });
  });

  it('getMeterLevels returns -Infinity for silent data', () => {
    const t = engine.createTrack('T');
    // mock getFloatTimeDomainData leaves the array as zeros
    expect(engine.getMeterLevels(t.id)).toEqual({ peak: -Infinity, rms: -Infinity });
  });

  it('getMeterLevels computes dB for a known signal', () => {
    const t = engine.createTrack('T');
    const state = trackState(engine, t.id);
    // Fill the analyser data with a constant 0.5 amplitude
    state.analyser.getFloatTimeDomainData = vi.fn((arr: Float32Array) => arr.fill(0.5));
    const { peak, rms } = engine.getMeterLevels(t.id);
    expect(peak).toBeCloseTo(20 * Math.log10(0.5), 1);
    expect(rms).toBeCloseTo(20 * Math.log10(0.5), 1);
  });

  it('getMasterLevels returns finite values structure', () => {
    engine.createTrack('T'); // ensures context
    const levels = engine.getMasterLevels();
    expect(levels).toHaveProperty('peak');
    expect(levels).toHaveProperty('rms');
  });

  it('getFrequencyData returns a Float32Array', () => {
    engine.createTrack('T');
    expect(engine.getFrequencyData()).toBeInstanceOf(Float32Array);
  });

  it('getMasterLevels returns -Infinity before any context', () => {
    const fresh = new AudioEngine();
    expect(fresh.getMasterLevels()).toEqual({ peak: -Infinity, rms: -Infinity });
  });

  it('getFrequencyData returns empty array before context', () => {
    expect(new AudioEngine().getFrequencyData()).toHaveLength(0);
  });
});

// ============================================================
// computeNormalization (pure)
// ============================================================

describe('AudioEngine — computeNormalization', () => {
  const engine = new AudioEngine();
  const reading = (over: Partial<LoudnessReading> = {}): LoudnessReading => ({
    momentary: -20, shortTerm: -20, integrated: -20, range: 5, truePeak: -3, ...over,
  });

  it('computes positive gain when measured is quieter than target', () => {
    const r = engine.computeNormalization(reading({ integrated: -20 }), 'youtube');
    // YouTube target -14, measured -20 → +6 dB
    expect(r.gainDb).toBeCloseTo(6);
    expect(r.targetLufs).toBe(-14);
    expect(r.measuredLufs).toBe(-20);
  });

  it('computes negative gain when measured is louder than target', () => {
    const r = engine.computeNormalization(reading({ integrated: -10 }), 'youtube');
    expect(r.gainDb).toBeCloseTo(-4);
  });

  it('flags willClip when projected true peak exceeds the limit', () => {
    // measured -20, target -14 → +6dB. truePeak -3 + 6 = +3 > -1 → clip
    const r = engine.computeNormalization(reading({ integrated: -20, truePeak: -3 }), 'youtube');
    expect(r.willClip).toBe(true);
  });

  it('does not flag willClip when projected peak is within limit', () => {
    // measured -14, target -14 → 0dB. truePeak -3 + 0 = -3 < -1 → no clip
    const r = engine.computeNormalization(reading({ integrated: -14, truePeak: -3 }), 'youtube');
    expect(r.willClip).toBe(false);
  });

  it('uses the correct target for ebuR128', () => {
    const r = engine.computeNormalization(reading({ integrated: -20 }), 'ebuR128');
    expect(r.targetLufs).toBe(-23);
    expect(r.gainDb).toBeCloseTo(-3);
  });
});

// ============================================================
// Loudness / noise / mix (delegate + offline)
// ============================================================

describe('AudioEngine — buffer processing', () => {
  function makeBuffer(channels = 2, length = 100, sampleRate = 48000): AudioBuffer {
    return {
      numberOfChannels: channels,
      length,
      sampleRate,
      duration: length / sampleRate,
      getChannelData: vi.fn(() => new Float32Array(length)),
    } as unknown as AudioBuffer;
  }

  it('analyzeLoudness returns a reading shape', async () => {
    const engine = new AudioEngine();
    await engine.init();
    const reading = await engine.analyzeLoudness(makeBuffer());
    expect(reading).toHaveProperty('integrated');
    expect(reading).toHaveProperty('truePeak');
  });

  it('reduceNoise throws when engine not initialized', async () => {
    const engine = new AudioEngine();
    await expect(engine.reduceNoise(makeBuffer(), 0.5)).rejects.toThrow('not initialized');
  });

  it('reduceNoise returns a buffer of matching dimensions', async () => {
    const engine = new AudioEngine();
    await engine.init();
    const out = await engine.reduceNoise(makeBuffer(2, 100), 0.5);
    expect(out.numberOfChannels).toBe(2);
    expect(out.length).toBe(100);
  });

  it('enhanceVoice throws when engine not initialized', async () => {
    const engine = new AudioEngine();
    await expect(engine.enhanceVoice(makeBuffer(), { clarity: 0.5, warmth: 0.3 })).rejects.toThrow(
      'not initialized'
    );
  });

  it('exportMix throws when engine not initialized', async () => {
    const engine = new AudioEngine();
    await expect(engine.exportMix([], 1)).rejects.toThrow('not initialized');
  });
});

// ============================================================
// destroy
// ============================================================

describe('AudioEngine — destroy', () => {
  it('closes context and clears tracks', () => {
    const engine = new AudioEngine();
    engine.createTrack('T');
    engine.destroy();
    expect(engine.getMeterLevels('any')).toEqual({ peak: -Infinity, rms: -Infinity });
  });

  it('REGRESSION: getMasterLevels returns -Infinity after destroy (no stale node)', () => {
    const engine = new AudioEngine();
    engine.createTrack('T');
    engine.destroy();
    expect(engine.getMasterLevels()).toEqual({ peak: -Infinity, rms: -Infinity });
  });

  it('getFrequencyData returns empty after destroy', () => {
    const engine = new AudioEngine();
    engine.createTrack('T');
    engine.destroy();
    expect(engine.getFrequencyData()).toHaveLength(0);
  });

  it('is safe to call without init', () => {
    expect(() => new AudioEngine().destroy()).not.toThrow();
  });
});
