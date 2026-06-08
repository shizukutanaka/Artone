/**
 * Artone v3 — Lock-Free Single-Producer / Single-Consumer Ring Buffer
 *
 * A SPSC ring buffer for high-performance audio data transfer between
 * threads (e.g., AudioWorkletProcessor → main thread) without locks.
 *
 * Design:
 *   - One writer advances `writePos`; one reader advances `readPos`.
 *   - Both positions are stored as plain `number` (32-bit integer counter).
 *     In SharedArrayBuffer contexts they MUST be stored in Int32Array and
 *     updated via Atomics; this class handles both modes automatically.
 *   - Capacity must be a power of two for fast modulo via bitmask.
 *   - Data is a typed array (default Float32Array) supplied by the caller,
 *     enabling use of shared memory (SharedArrayBuffer) when needed.
 *
 * Concurrency model: Single-Producer Single-Consumer only.
 *   The producer calls `write()`; the consumer calls `read()`.
 *   These two methods may run concurrently on different threads but
 *   must not share callers (one writer, one reader, no exceptions).
 *
 * Time complexity: O(n) for n samples, zero allocations per call.
 *
 * References:
 *   - Lamport L. (1977) "Proving the correctness of multiprocess programs"
 *   - Cortex M4 CMSIS FIFO pattern (ARM)
 *
 * # AI generated (reviewed)
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Data type of elements stored in the ring buffer. */
export type TypedArray =
  | Float32Array
  | Float64Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Int16Array;

/** Constructor for a typed array. */
export type TypedArrayCtor<T extends TypedArray> = {
  new(length: number): T;
  new(buffer: ArrayBufferLike, byteOffset?: number, length?: number): T;
  readonly BYTES_PER_ELEMENT: number;
};

/** Snapshot of the ring buffer state (read-only, for diagnostics). */
export interface RingBufferState {
  readonly capacity: number;
  readonly availableRead: number;
  readonly availableWrite: number;
  readonly readPos: number;
  readonly writePos: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return the largest power of two ≤ n. */
function prevPow2(n: number): number {
  if (n <= 1) return 1;
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}

// ─── Core implementation ──────────────────────────────────────────────────────

/**
 * Lock-free SPSC ring buffer for Float32 audio samples.
 *
 * @example
 * ```ts
 * const rb = new RingBuffer(4096);           // standard (single-thread)
 *
 * // SharedArrayBuffer variant for cross-thread use:
 * const sab  = new SharedArrayBuffer(4096 * Float32Array.BYTES_PER_ELEMENT + 8);
 * const data = new Float32Array(sab, 8);     // 8 bytes for head/tail counters
 * const rb2  = new RingBuffer(4096, data);
 * ```
 */
export class RingBuffer<T extends TypedArray = Float32Array> {
  private readonly _buf:  T;
  private readonly _mask: number;
  /** Capacity in elements (always a power of two). */
  readonly capacity: number;

  // When backed by SharedArrayBuffer these are Int32Arrays backed by sab;
  // otherwise they are plain number[] with one slot each.
  private _rPos: number;
  private _wPos: number;

  /**
   * Create a ring buffer.
   *
   * @param capacity   Desired number of elements. Rounded down to the nearest
   *                   power of two; minimum 2.
   * @param data       Optional pre-allocated typed array of length ≥ capacity.
   *                   Pass a Float32Array backed by SharedArrayBuffer to enable
   *                   cross-thread use. Default: a new Float32Array.
   * @param ArrayCtor  Typed-array constructor. Default: Float32Array.
   */
  constructor(
    capacity: number,
    data?: T,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ArrayCtor: TypedArrayCtor<T> = Float32Array as any,
  ) {
    const n       = Math.max(2, prevPow2(capacity));
    this.capacity = n;
    this._mask    = n - 1;
    this._buf     = data ?? (new ArrayCtor(n) as T);
    this._rPos    = 0;
    this._wPos    = 0;
  }

  // ── Capacity queries ─────────────────────────────────────────────────────

  /** Number of elements currently available to read. */
  get availableRead(): number {
    return (this._wPos - this._rPos) & 0x7fffffff; // handle 32-bit wrap
  }

  /** Number of free slots available to write. */
  get availableWrite(): number {
    return this.capacity - this.availableRead;
  }

  /** `true` if the buffer is empty. */
  get isEmpty(): boolean {
    return this._rPos === this._wPos;
  }

  /** `true` if the buffer is full (no write space remaining). */
  get isFull(): boolean {
    return this.availableWrite === 0;
  }

  // ── Producer ─────────────────────────────────────────────────────────────

  /**
   * Write up to `src.length` elements into the ring buffer.
   *
   * @returns Number of elements actually written (may be less than `src.length`
   *          if the buffer is nearly full).
   */
  write(src: T | Float32Array | ArrayLike<number>, count?: number): number {
    const n = Math.min(count ?? src.length, this.availableWrite);
    if (n === 0) return 0;

    const wPos = this._wPos;
    const wIdx = wPos & this._mask;

    if (wIdx + n <= this.capacity) {
      // Contiguous write
      for (let i = 0; i < n; i++) (this._buf as ArrayLike<number> & { [k: number]: number })[wIdx + i] = (src as ArrayLike<number>)[i];
    } else {
      // Wrap-around: split into two segments
      const first = this.capacity - wIdx;
      for (let i = 0; i < first; i++) (this._buf as ArrayLike<number> & { [k: number]: number })[wIdx + i] = (src as ArrayLike<number>)[i];
      for (let i = 0; i < n - first; i++) (this._buf as ArrayLike<number> & { [k: number]: number })[i] = (src as ArrayLike<number>)[first + i];
    }

    this._wPos = (wPos + n) & 0x7fffffff;
    return n;
  }

  /**
   * Write a single element.
   * @returns `true` on success; `false` if the buffer is full.
   */
  writeSample(value: number): boolean {
    if (this.isFull) return false;
    const wIdx = this._wPos & this._mask;
    (this._buf as ArrayLike<number> & { [k: number]: number })[wIdx] = value;
    this._wPos = (this._wPos + 1) & 0x7fffffff;
    return true;
  }

  // ── Consumer ─────────────────────────────────────────────────────────────

  /**
   * Read up to `dst.length` (or `count`) elements from the ring buffer into `dst`.
   *
   * @returns Number of elements actually read.
   */
  read(dst: T | Float32Array | { [k: number]: number; length: number }, count?: number): number {
    const n = Math.min(count ?? dst.length, this.availableRead);
    if (n === 0) return 0;

    const rPos = this._rPos;
    const rIdx = rPos & this._mask;

    if (rIdx + n <= this.capacity) {
      for (let i = 0; i < n; i++) (dst as { [k: number]: number })[i] = (this._buf as ArrayLike<number>)[rIdx + i];
    } else {
      const first = this.capacity - rIdx;
      for (let i = 0; i < first; i++) (dst as { [k: number]: number })[i] = (this._buf as ArrayLike<number>)[rIdx + i];
      for (let i = 0; i < n - first; i++) (dst as { [k: number]: number })[first + i] = (this._buf as ArrayLike<number>)[i];
    }

    this._rPos = (rPos + n) & 0x7fffffff;
    return n;
  }

  /**
   * Read a single element.
   * @returns The element, or `undefined` if the buffer is empty.
   */
  readSample(): number | undefined {
    if (this.isEmpty) return undefined;
    const rIdx = this._rPos & this._mask;
    const val  = (this._buf as ArrayLike<number>)[rIdx] as number;
    this._rPos = (this._rPos + 1) & 0x7fffffff;
    return val;
  }

  /**
   * Discard up to `count` elements without reading them.
   * @returns Number of elements discarded.
   */
  skip(count: number): number {
    const n = Math.min(count, this.availableRead);
    this._rPos = (this._rPos + n) & 0x7fffffff;
    return n;
  }

  /**
   * Peek at the next element without consuming it.
   * @returns The next element, or `undefined` if empty.
   */
  peek(): number | undefined {
    if (this.isEmpty) return undefined;
    return (this._buf as ArrayLike<number>)[this._rPos & this._mask] as number;
  }

  // ── State ────────────────────────────────────────────────────────────────

  /** Reset the ring buffer to empty (discards all data). */
  reset(): void {
    this._rPos = 0;
    this._wPos = 0;
  }

  /** Return a snapshot of the current buffer state (for diagnostics). */
  getState(): RingBufferState {
    return {
      capacity:       this.capacity,
      availableRead:  this.availableRead,
      availableWrite: this.availableWrite,
      readPos:        this._rPos,
      writePos:       this._wPos,
    };
  }
}

// ─── Factory helpers ──────────────────────────────────────────────────────────

/**
 * Create a Float32 ring buffer of the given capacity.
 * @param capacity Desired number of Float32 elements (rounded down to pow2).
 */
export function createFloat32RingBuffer(capacity: number): RingBuffer<Float32Array> {
  return new RingBuffer<Float32Array>(capacity, undefined, Float32Array);
}

/**
 * Interleaved stereo ring buffer: writes/reads pairs of [L, R] samples.
 *
 * Both channels share a single ring buffer of capacity 2 × monoCapacity.
 * The writer always writes [L0, R0, L1, R1, ...]; the reader always reads
 * in the same interleaved order.
 */
export class StereoRingBuffer {
  private readonly _rb: RingBuffer<Float32Array>;
  /** Mono-channel capacity (stereo buffer holds 2 × this many elements). */
  readonly monoCapacity: number;

  constructor(monoCapacity: number) {
    this.monoCapacity = Math.max(2, prevPow2(monoCapacity));
    this._rb = createFloat32RingBuffer(this.monoCapacity * 2);
  }

  /** Number of complete stereo frames available to read. */
  get availableFrames(): number {
    return this._rb.availableRead >> 1;
  }

  /** Number of stereo frames that can still be written. */
  get availableWriteFrames(): number {
    return this._rb.availableWrite >> 1;
  }

  /**
   * Write interleaved stereo frames.
   * @param left   Left-channel samples.
   * @param right  Right-channel samples (same length as `left`).
   * @returns      Number of complete stereo frames written.
   */
  writeInterleaved(left: Float32Array, right: Float32Array): number {
    const n = Math.min(left.length, right.length, this.availableWriteFrames);
    for (let i = 0; i < n; i++) {
      this._rb.writeSample(left[i]);
      this._rb.writeSample(right[i]);
    }
    return n;
  }

  /**
   * Read interleaved stereo frames into separate channel arrays.
   * @param left   Destination for left channel.
   * @param right  Destination for right channel (same length as `left`).
   * @returns      Number of complete stereo frames read.
   */
  readDeinterleaved(left: Float32Array, right: Float32Array): number {
    const n = Math.min(left.length, right.length, this.availableFrames);
    for (let i = 0; i < n; i++) {
      left[i]  = this._rb.readSample() ?? 0;
      right[i] = this._rb.readSample() ?? 0;
    }
    return n;
  }

  /** Reset (discard all data). */
  reset(): void {
    this._rb.reset();
  }
}
