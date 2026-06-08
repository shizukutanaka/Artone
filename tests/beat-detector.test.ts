/**
 * Beat Detector Tests — audio/beat-detector.ts
 *
 * Covers: detectBeats() batch API, createBeatDetector() streaming API,
 * BPM estimation, confidence scoring, and edge cases.
 */

import { describe, it, expect } from 'vitest';
import {
  detectBeats,
  createBeatDetector,
  type BeatDetectionResult,
} from '../audio/beat-detector';

const SR = 48000; // default sample rate

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Generate a mono signal with sinusoidal bursts at regular beat intervals.
 * Each burst is `burstSamples` samples of a 440 Hz sine at the given amplitude,
 * surrounded by silence.  This gives clean energy onsets at each beat position.
 */
function beatsSignal(
  bpm: number,
  durationSec: number,
  sr = SR,
  amplitude = 1.0,
  burstSamples = 512,
): Float32Array {
  const n = Math.round(durationSec * sr);
  const beatInterval = Math.round((sr * 60) / bpm);
  const out = new Float32Array(n);
  for (let beatStart = 0; beatStart < n; beatStart += beatInterval) {
    for (let j = 0; j < burstSamples && beatStart + j < n; j++) {
      out[beatStart + j] = amplitude * Math.sin((2 * Math.PI * 440 * j) / sr);
    }
  }
  return out;
}

/** All-zero signal of given duration. */
function silence(durationSec: number, sr = SR): Float32Array {
  return new Float32Array(Math.round(durationSec * sr));
}

// ─── detectBeats — edge cases ─────────────────────────────────────────────────

describe('detectBeats — edge cases', () => {
  it('empty audio returns no beats', () => {
    const r = detectBeats(new Float32Array(0));
    expect(r.beats).toEqual([]);
    expect(r.bpm).toBe(0);
    expect(r.confidence).toBe(0);
  });

  it('audio shorter than windowSize returns no beats', () => {
    const r = detectBeats(new Float32Array(512), { windowSize: 1024 });
    expect(r.beats).toEqual([]);
  });

  it('silence returns no beats', () => {
    const r = detectBeats(silence(5));
    expect(r.beats).toEqual([]);
    expect(r.bpm).toBe(0);
  });

  it('single burst gives at most 1 beat (no BPM estimation)', () => {
    // One isolated burst at the start
    const audio = new Float32Array(SR * 3);
    for (let i = 0; i < 512; i++) audio[i] = Math.sin((2 * Math.PI * 440 * i) / SR);
    const r = detectBeats(audio);
    // May or may not detect the burst depending on history, but BPM must be 0
    expect(r.bpm).toBe(0);
    expect(r.confidence).toBe(0);
  });

  it('audio shorter than historySize returns no beats', () => {
    // historySize ≈ ceil(48000/512) = 94 windows = ~1 second
    // Feed less than 1 second
    const r = detectBeats(beatsSignal(120, 0.8));
    expect(r.beats).toEqual([]);
  });
});

// ─── detectBeats — 120 BPM ───────────────────────────────────────────────────

describe('detectBeats — 120 BPM', () => {
  it('detects multiple beats in a 5 s 120-BPM signal', () => {
    const r = detectBeats(beatsSignal(120, 5));
    expect(r.beats.length).toBeGreaterThanOrEqual(4);
  });

  it('estimated BPM is close to 120', () => {
    const r = detectBeats(beatsSignal(120, 5));
    expect(r.bpm).toBeGreaterThan(110);
    expect(r.bpm).toBeLessThan(130);
  });

  it('beat times are in ascending order', () => {
    const r = detectBeats(beatsSignal(120, 5));
    for (let i = 1; i < r.beats.length; i++) {
      expect(r.beats[i]).toBeGreaterThan(r.beats[i - 1]);
    }
  });

  it('all beat times fall within the signal duration', () => {
    const dur = 5;
    const r = detectBeats(beatsSignal(120, dur));
    for (const t of r.beats) {
      expect(t).toBeGreaterThanOrEqual(0);
      expect(t).toBeLessThanOrEqual(dur + 0.1);  // small rounding tolerance
    }
  });

  it('confidence is high for a perfectly regular beat pattern', () => {
    const r = detectBeats(beatsSignal(120, 6));
    if (r.beats.length >= 4) {
      expect(r.confidence).toBeGreaterThan(0.6);
    }
  });
});

// ─── detectBeats — different tempos ──────────────────────────────────────────

describe('detectBeats — different tempos', () => {
  it('estimates 60 BPM correctly', () => {
    const r = detectBeats(beatsSignal(60, 8));
    expect(r.beats.length).toBeGreaterThanOrEqual(4);
    expect(r.bpm).toBeGreaterThan(52);
    expect(r.bpm).toBeLessThan(68);
  });

  it('estimates 160 BPM correctly', () => {
    const r = detectBeats(beatsSignal(160, 5));
    expect(r.beats.length).toBeGreaterThanOrEqual(4);
    expect(r.bpm).toBeGreaterThan(145);
    expect(r.bpm).toBeLessThan(175);
  });

  it('estimates 90 BPM correctly', () => {
    const r = detectBeats(beatsSignal(90, 6));
    expect(r.beats.length).toBeGreaterThanOrEqual(3);
    expect(r.bpm).toBeGreaterThan(80);
    expect(r.bpm).toBeLessThan(100);
  });

  it('faster tempo has more beats than slower tempo (same duration)', () => {
    const fast = detectBeats(beatsSignal(160, 6));
    const slow = detectBeats(beatsSignal(60, 6));
    expect(fast.beats.length).toBeGreaterThan(slow.beats.length);
  });
});

// ─── detectBeats — options ────────────────────────────────────────────────────

describe('detectBeats — options', () => {
  it('higher threshold detects fewer or equal beats', () => {
    const sig = beatsSignal(120, 5);
    const low  = detectBeats(sig, { threshold: 1.3 });
    const high = detectBeats(sig, { threshold: 3.0 });
    expect(high.beats.length).toBeLessThanOrEqual(low.beats.length);
  });

  it('longer minIntervalSec reduces duplicate detections', () => {
    const sig = beatsSignal(120, 5);
    const tight = detectBeats(sig, { minIntervalSec: 0.1 });
    const wide  = detectBeats(sig, { minIntervalSec: 0.6 });
    expect(wide.beats.length).toBeLessThanOrEqual(tight.beats.length);
  });

  it('custom sampleRate is respected', () => {
    // 44100 Hz signal at 120 BPM
    const sig44 = beatsSignal(120, 5, 44100);
    const r = detectBeats(sig44, { sampleRate: 44100 });
    expect(r.beats.length).toBeGreaterThanOrEqual(4);
    expect(r.bpm).toBeGreaterThan(110);
    expect(r.bpm).toBeLessThan(130);
  });

  it('smaller windowSize still detects beats', () => {
    const r = detectBeats(beatsSignal(120, 5), { windowSize: 512, hopSize: 256 });
    expect(r.beats.length).toBeGreaterThanOrEqual(4);
  });

  it('bpm is 0 when only one beat is detected regardless of options', () => {
    // Very high threshold + long signal — force at most one detection
    const r = detectBeats(beatsSignal(60, 3), { threshold: 100 });
    expect(r.bpm).toBe(0);
  });
});

// ─── createBeatDetector — streaming ───────────────────────────────────────────

describe('createBeatDetector — streaming', () => {
  it('returns correct interface', () => {
    const d = createBeatDetector();
    expect(typeof d.process).toBe('function');
    expect(typeof d.getResult).toBe('function');
    expect(typeof d.reset).toBe('function');
  });

  it('empty detector returns no beats', () => {
    const d = createBeatDetector();
    const r = d.getResult();
    expect(r.beats).toEqual([]);
    expect(r.bpm).toBe(0);
  });

  it('streaming full signal gives same BPM as batch', () => {
    const sig = beatsSignal(120, 5);
    const batch = detectBeats(sig);

    const d = createBeatDetector();
    d.process(sig);
    const streaming = d.getResult();

    // Same underlying algorithm → identical result
    expect(streaming.bpm).toBe(batch.bpm);
    expect(streaming.beats.length).toBe(batch.beats.length);
  });

  it('chunked processing gives same result as one block', () => {
    const sig = beatsSignal(120, 5);
    const CHUNK = 4096;

    const full  = createBeatDetector();
    const chunk = createBeatDetector();

    full.process(sig);

    for (let i = 0; i < sig.length; i += CHUNK) {
      chunk.process(sig.subarray(i, i + CHUNK));
    }

    const mFull  = full.getResult();
    const mChunk = chunk.getResult();
    expect(mChunk.bpm).toBe(mFull.bpm);
    expect(mChunk.beats.length).toBe(mFull.beats.length);
  });

  it('reset clears all state', () => {
    const d = createBeatDetector();
    d.process(beatsSignal(120, 5));
    d.reset();
    const r = d.getResult();
    expect(r.beats).toEqual([]);
    expect(r.bpm).toBe(0);
  });

  it('empty process() call is a no-op', () => {
    const d = createBeatDetector();
    d.process(new Float32Array(0));
    expect(d.getResult().beats).toEqual([]);
  });

  it('processing silence then signal detects beats after non-silent section', () => {
    const d = createBeatDetector();
    d.process(silence(1));   // 1 s of pre-roll silence
    d.process(beatsSignal(120, 5));
    const r = d.getResult();
    expect(r.beats.length).toBeGreaterThan(0);
  });

  it('getResult can be called multiple times without side effects', () => {
    const d = createBeatDetector();
    d.process(beatsSignal(120, 5));
    const r1 = d.getResult();
    const r2 = d.getResult();
    expect(r1.bpm).toBe(r2.bpm);
    expect(r1.beats).toEqual(r2.beats);
  });
});

// ─── BPM estimation ───────────────────────────────────────────────────────────

describe('BPM estimation edge cases', () => {
  it('returns bpm=0 for fewer than 2 beats', () => {
    // Force threshold so high nothing passes
    const r = detectBeats(beatsSignal(120, 5), { threshold: 1000 });
    expect(r.bpm).toBe(0);
    expect(r.confidence).toBe(0);
  });

  it('very irregular beat pattern has low confidence', () => {
    // Construct an intentionally irregular pattern
    const sr = 48000;
    const n  = sr * 8;
    const audio = new Float32Array(n);
    const burstLen = 512;
    // Beats at highly irregular intervals: 0.5, 0.8, 1.5, 2.0, 3.2, 4.0, 5.5s
    const positions = [0.5, 0.8, 1.5, 2.0, 3.2, 4.0, 5.5].map((t) => Math.round(t * sr));
    for (const pos of positions) {
      for (let j = 0; j < burstLen && pos + j < n; j++) {
        audio[pos + j] = Math.sin((2 * Math.PI * 440 * j) / sr);
      }
    }
    const r = detectBeats(audio);
    // We may or may not detect all of them, but confidence should be low
    // (intervals vary widely)
    if (r.beats.length >= 3) {
      expect(r.confidence).toBeLessThan(0.8);
    }
  });
});
