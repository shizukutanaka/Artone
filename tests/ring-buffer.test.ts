/**
 * Lock-Free Ring Buffer Tests — core/ring-buffer.ts
 *
 * Covers: RingBuffer<Float32Array> (write/read/skip/peek),
 * edge cases (full/empty/wrap-around), StereoRingBuffer, and helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  RingBuffer,
  StereoRingBuffer,
  createFloat32RingBuffer,
} from '../core/ring-buffer';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Create a Float32Array of sequential values [start, start+1, ...]. */
function seq(n: number, start = 0): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = start + i;
  return out;
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('RingBuffer — construction', () => {
  it('capacity is rounded down to the nearest power of two', () => {
    expect(new RingBuffer(1000).capacity).toBe(512);
    expect(new RingBuffer(1024).capacity).toBe(1024);
    expect(new RingBuffer(1025).capacity).toBe(1024);
    expect(new RingBuffer(2047).capacity).toBe(1024);
    expect(new RingBuffer(2048).capacity).toBe(2048);
  });

  it('minimum capacity is 2', () => {
    expect(new RingBuffer(1).capacity).toBe(2);
    expect(new RingBuffer(0).capacity).toBe(2);
  });

  it('starts empty', () => {
    const rb = new RingBuffer(16);
    expect(rb.isEmpty).toBe(true);
    expect(rb.availableRead).toBe(0);
    expect(rb.availableWrite).toBe(16);
  });

  it('createFloat32RingBuffer returns a Float32Array-backed buffer', () => {
    const rb = createFloat32RingBuffer(256);
    expect(rb.capacity).toBe(256);
    expect(rb.isEmpty).toBe(true);
  });
});

// ─── Basic write / read ───────────────────────────────────────────────────────

describe('RingBuffer — basic write / read', () => {
  it('write and read back the same values', () => {
    const rb  = createFloat32RingBuffer(64);
    const src = seq(16);
    rb.write(src);
    const dst = new Float32Array(16);
    rb.read(dst);
    for (let i = 0; i < 16; i++) expect(dst[i]).toBe(src[i]);
  });

  it('write returns the number of elements written', () => {
    const rb = createFloat32RingBuffer(16);
    expect(rb.write(seq(8))).toBe(8);
  });

  it('read returns the number of elements read', () => {
    const rb = createFloat32RingBuffer(16);
    rb.write(seq(8));
    const dst = new Float32Array(16);
    expect(rb.read(dst)).toBe(8);
  });

  it('availableRead and availableWrite update correctly', () => {
    const rb = createFloat32RingBuffer(16);
    expect(rb.availableWrite).toBe(16);
    rb.write(seq(6));
    expect(rb.availableRead).toBe(6);
    expect(rb.availableWrite).toBe(10);
    const dst = new Float32Array(4);
    rb.read(dst);
    expect(rb.availableRead).toBe(2);
    expect(rb.availableWrite).toBe(14);
  });

  it('write truncates when buffer becomes full', () => {
    const rb = createFloat32RingBuffer(8);
    expect(rb.write(seq(100))).toBe(8);
    expect(rb.isFull).toBe(true);
  });

  it('read truncates when buffer becomes empty', () => {
    const rb = createFloat32RingBuffer(8);
    rb.write(seq(4));
    const dst = new Float32Array(100);
    expect(rb.read(dst)).toBe(4);
    expect(rb.isEmpty).toBe(true);
  });

  it('writeSample / readSample round-trip', () => {
    const rb = createFloat32RingBuffer(4);
    expect(rb.writeSample(3.14)).toBe(true);
    expect(rb.writeSample(2.72)).toBe(true);
    expect(rb.readSample()).toBeCloseTo(3.14, 5);
    expect(rb.readSample()).toBeCloseTo(2.72, 5);
  });

  it('writeSample returns false when full', () => {
    const rb = createFloat32RingBuffer(2);
    rb.writeSample(1);
    rb.writeSample(2);
    expect(rb.writeSample(3)).toBe(false);
  });

  it('readSample returns undefined when empty', () => {
    const rb = createFloat32RingBuffer(8);
    expect(rb.readSample()).toBeUndefined();
  });
});

// ─── Wrap-around ─────────────────────────────────────────────────────────────

describe('RingBuffer — wrap-around', () => {
  it('handles wrap-around correctly', () => {
    const rb = createFloat32RingBuffer(8);
    rb.write(seq(6));       // wPos = 6
    const tmp = new Float32Array(6);
    rb.read(tmp);            // rPos = 6
    // Now write wraps around: positions 6,7,0,1,2,3
    rb.write(seq(6, 100));
    const dst = new Float32Array(6);
    rb.read(dst);
    for (let i = 0; i < 6; i++) expect(dst[i]).toBe(100 + i);
  });

  it('multiple wrap-arounds preserve data', () => {
    const rb = createFloat32RingBuffer(4);
    for (let pass = 0; pass < 10; pass++) {
      rb.write(seq(3, pass * 3));
      const dst = new Float32Array(3);
      rb.read(dst);
      for (let i = 0; i < 3; i++) expect(dst[i]).toBe(pass * 3 + i);
    }
  });

  it('interleaved partial writes and reads are consistent', () => {
    const rb = createFloat32RingBuffer(16);
    let writeIdx = 0; let readIdx = 0;
    for (let step = 0; step < 20; step++) {
      const writeN = Math.min(5, rb.availableWrite);
      rb.write(seq(writeN, writeIdx));
      writeIdx += writeN;
      const dst = new Float32Array(3);
      const n = rb.read(dst);
      for (let i = 0; i < n; i++) expect(dst[i]).toBe(readIdx + i);
      readIdx += n;
    }
  });
});

// ─── skip / peek ─────────────────────────────────────────────────────────────

describe('RingBuffer — skip / peek', () => {
  it('skip advances readPos without returning data', () => {
    const rb = createFloat32RingBuffer(8);
    rb.write(seq(6));
    rb.skip(3);
    expect(rb.availableRead).toBe(3);
    const dst = new Float32Array(3);
    rb.read(dst);
    for (let i = 0; i < 3; i++) expect(dst[i]).toBe(3 + i);
  });

  it('skip returns number of elements discarded', () => {
    const rb = createFloat32RingBuffer(8);
    rb.write(seq(4));
    expect(rb.skip(10)).toBe(4); // clamps to available
  });

  it('peek returns next element without consuming it', () => {
    const rb = createFloat32RingBuffer(8);
    rb.write(new Float32Array([5, 6, 7]));
    expect(rb.peek()).toBe(5);
    expect(rb.availableRead).toBe(3); // unchanged
    expect(rb.readSample()).toBe(5);  // first sample
  });

  it('peek on empty returns undefined', () => {
    const rb = createFloat32RingBuffer(8);
    expect(rb.peek()).toBeUndefined();
  });
});

// ─── reset ────────────────────────────────────────────────────────────────────

describe('RingBuffer — reset', () => {
  it('reset clears all data', () => {
    const rb = createFloat32RingBuffer(16);
    rb.write(seq(10));
    rb.reset();
    expect(rb.isEmpty).toBe(true);
    expect(rb.availableRead).toBe(0);
    expect(rb.availableWrite).toBe(16);
  });

  it('can write after reset', () => {
    const rb = createFloat32RingBuffer(8);
    rb.write(seq(8));
    rb.reset();
    rb.write(seq(4, 99));
    const dst = new Float32Array(4);
    rb.read(dst);
    expect(dst[0]).toBe(99);
  });
});

// ─── getState ─────────────────────────────────────────────────────────────────

describe('RingBuffer — getState', () => {
  it('returns correct state snapshot', () => {
    const rb = createFloat32RingBuffer(8);
    rb.write(seq(3));
    const s = rb.getState();
    expect(s.capacity).toBe(8);
    expect(s.availableRead).toBe(3);
    expect(s.availableWrite).toBe(5);
    expect(s.writePos).toBe(3);
    expect(s.readPos).toBe(0);
  });
});

// ─── count parameter ──────────────────────────────────────────────────────────

describe('RingBuffer — count parameter', () => {
  it('write with count reads fewer elements', () => {
    const rb  = createFloat32RingBuffer(16);
    const src = seq(10);
    expect(rb.write(src, 4)).toBe(4);
    expect(rb.availableRead).toBe(4);
  });

  it('read with count reads fewer elements', () => {
    const rb  = createFloat32RingBuffer(16);
    rb.write(seq(8));
    const dst = new Float32Array(8);
    expect(rb.read(dst, 3)).toBe(3);
    expect(rb.availableRead).toBe(5);
    expect(dst[0]).toBe(0);
    expect(dst[1]).toBe(1);
    expect(dst[2]).toBe(2);
  });
});

// ─── StereoRingBuffer ─────────────────────────────────────────────────────────

describe('StereoRingBuffer', () => {
  it('construction: monoCapacity is pow2', () => {
    const srb = new StereoRingBuffer(100);
    expect(srb.monoCapacity).toBe(64);
  });

  it('availableFrames starts at 0', () => {
    expect(new StereoRingBuffer(16).availableFrames).toBe(0);
  });

  it('writeInterleaved / readDeinterleaved round-trip', () => {
    const srb = new StereoRingBuffer(16);
    const L = seq(8);
    const R = seq(8, 100);
    expect(srb.writeInterleaved(L, R)).toBe(8);
    expect(srb.availableFrames).toBe(8);

    const outL = new Float32Array(8);
    const outR = new Float32Array(8);
    expect(srb.readDeinterleaved(outL, outR)).toBe(8);
    for (let i = 0; i < 8; i++) {
      expect(outL[i]).toBe(i);
      expect(outR[i]).toBe(100 + i);
    }
  });

  it('returns fewer frames when buffer is almost full', () => {
    const srb = new StereoRingBuffer(8);
    // monoCapacity=8 → buffer can hold 16 interleaved samples
    const n = srb.writeInterleaved(seq(100), seq(100));
    expect(n).toBeLessThanOrEqual(8);
  });

  it('reset empties the buffer', () => {
    const srb = new StereoRingBuffer(16);
    srb.writeInterleaved(seq(4), seq(4));
    srb.reset();
    expect(srb.availableFrames).toBe(0);
  });

  it('stereo channels stay independent across wrap-around', () => {
    const srb = new StereoRingBuffer(8);
    const outL = new Float32Array(6);
    const outR = new Float32Array(6);

    // Fill to 6 frames, drain, then write again to force wrap
    srb.writeInterleaved(seq(6), seq(6, 100));
    srb.readDeinterleaved(outL, outR);

    srb.writeInterleaved(seq(6, 200), seq(6, 300));
    srb.readDeinterleaved(outL, outR);

    for (let i = 0; i < 6; i++) {
      expect(outL[i]).toBe(200 + i);
      expect(outR[i]).toBe(300 + i);
    }
  });
});

// ─── Large-scale stress test ──────────────────────────────────────────────────

describe('RingBuffer — stress', () => {
  it('1 million sample throughput maintains ordering', () => {
    const rb = createFloat32RingBuffer(1024);
    const CHUNK = 256;
    let writeCounter = 0;
    let readCounter  = 0;
    let totalRead    = 0;
    const dst = new Float32Array(CHUNK);

    for (let pass = 0; pass < 1000; pass++) {
      // Write
      const src = new Float32Array(CHUNK);
      for (let i = 0; i < CHUNK; i++) src[i] = writeCounter + i;
      const written = rb.write(src);
      writeCounter += written;

      // Read
      const n = rb.read(dst);
      for (let i = 0; i < n; i++) {
        expect(dst[i]).toBe(readCounter + i);
      }
      readCounter += n;
      totalRead   += n;
    }
    expect(totalRead).toBeGreaterThan(200000);
  });
});

// ─── Cross-thread (SharedArrayBuffer + Atomics) mode ──────────────────────────

describe('RingBuffer — SharedArrayBuffer cross-thread mode', () => {
  /** Build a Float32Array view with 8 header bytes reserved, per the class's documented convention. */
  function makeSharedData(capacity: number): Float32Array {
    const sab = new SharedArrayBuffer(capacity * Float32Array.BYTES_PER_ELEMENT + 8);
    return new Float32Array(sab, 8);
  }

  it('a plain (non-shared) buffer is not cross-thread shared', () => {
    const rb = createFloat32RingBuffer(16);
    expect(rb.isCrossThreadShared).toBe(false);
  });

  it('a SharedArrayBuffer-backed buffer with 8 reserved header bytes is cross-thread shared', () => {
    const rb = new RingBuffer(16, makeSharedData(16));
    expect(rb.isCrossThreadShared).toBe(true);
  });

  it(
    'REGRESSION: two independently-constructed instances wrapping the same SharedArrayBuffer see each other\'s progress',
    () => {
      // Before fix: _rPos/_wPos were always plain per-instance number fields,
      // even when backed by SharedArrayBuffer -- two RingBuffer instances
      // wrapping the same underlying buffer (exactly the documented
      // producer-thread / consumer-thread pattern) each had their own
      // disconnected position counters starting at 0, so the "consumer"
      // instance could never see data the "producer" instance wrote.
      const data = makeSharedData(16);
      const producer = new RingBuffer(16, data);
      const consumer = new RingBuffer(16, data);

      const written = producer.write(seq(5, 10)); // [10,11,12,13,14]
      expect(written).toBe(5);

      // The consumer instance must observe the producer's write immediately
      // (same underlying Int32 position counters), not report empty.
      expect(consumer.isEmpty).toBe(false);
      expect(consumer.availableRead).toBe(5);

      const dst = new Float32Array(5);
      const readCount = consumer.read(dst);
      expect(readCount).toBe(5);
      expect(Array.from(dst)).toEqual([10, 11, 12, 13, 14]);

      // And the producer instance must observe the consumer's read (shared
      // position), leaving the buffer empty from either instance's view.
      expect(producer.isEmpty).toBe(true);
      expect(producer.availableRead).toBe(0);
    }
  );

  it('constructing a second instance does not reset an already-in-progress shared buffer', () => {
    // Before fix (if a reset-on-construct had been added instead): a peer
    // thread constructing its own RingBuffer wrapper after data was already
    // written would clobber the in-progress position back to empty.
    const data = makeSharedData(16);
    const producer = new RingBuffer(16, data);
    producer.write(seq(4, 100));

    const consumerConstructedLater = new RingBuffer(16, data);
    expect(consumerConstructedLater.availableRead).toBe(4);
  });
});
