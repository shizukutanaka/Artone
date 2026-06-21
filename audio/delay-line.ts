/**
 * Artone v3 — Delay Line Effects
 *
 * Implements three classic delay-based audio effects:
 *   - Echo        : Fixed-time feedback delay (mono and ping-pong stereo).
 *   - Chorus      : Multi-voice sinusoidal modulation, wide stereo spread,
 *                   no feedback (Bray 1975 / Boss CE-1 circuit analysis).
 *   - Flanger     : Short modulated delay with feedback creating comb filter
 *                   sweeping effect (Eventide Instant Flanger, 1975).
 *
 * All algorithms use a circular delay buffer (fixed allocation at
 * construction time, zero GC during processing).
 *
 * All operations are purely numerical — no browser or Web Audio APIs used.
 *
 * References:
 *   - Zölzer U. (2011) "DAFX: Digital Audio Effects" §6 Modulation Effects
 *   - Reiss J.D., McPherson A. (2014) "Audio Effects: Theory, Implementation
 *     and Application" Ch.7
 *   - Steiglitz K. (1996) "A Digital Signal Processing Primer" Ch.11
 *
 * # AI generated (reviewed)
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Next power of two ≥ n (minimum 2). */
function nextPow2(n: number): number {
  if (n <= 1) return 2;
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Linearly interpolate a fractional position in a circular delay buffer.
 *
 * @param buf   Circular buffer.
 * @param mask  buf.length - 1 (must be pow2 − 1).
 * @param pos   Fractional read position (whole + frac parts).
 */
function readLinear(buf: Float32Array, mask: number, pos: number): number {
  const i  = Math.floor(pos) & mask;
  const j  = (i + 1) & mask;
  const f  = pos - Math.floor(pos);
  return buf[i] * (1 - f) + buf[j] * f;
}

// ─── Types ────────────────────────────────────────────────────────────────────

/** Options shared by all delay effects. */
export interface DelayOptions {
  /** Sample rate in Hz. Default: 48000. */
  sampleRate?: number;
  /**
   * Maximum delay capacity in milliseconds (sets the buffer size).
   * Must be ≥ the configured delay time. Default: 2000 ms.
   */
  maxDelayMs?: number;
}

/** Options for echo/ping-pong delay. */
export interface EchoOptions extends DelayOptions {
  /** Delay time in milliseconds. Default: 300 ms. */
  delayMs?: number;
  /**
   * Feedback coefficient [0, 1). How much of the output is fed back
   * into the delay buffer. 0 = single echo, 0.9 = long decay. Default: 0.4.
   */
  feedback?: number;
  /** Wet/dry mix [0, 1]. 0 = dry only, 1 = wet only. Default: 0.4. */
  wetDry?: number;
}

/** Options for chorus. */
export interface ChorusOptions extends DelayOptions {
  /** Centre delay in milliseconds. Default: 10 ms. */
  centerDelayMs?: number;
  /** LFO rate in Hz. Default: 0.5 Hz. */
  modRateHz?: number;
  /** LFO depth in milliseconds (± this value). Default: 5 ms. */
  modDepthMs?: number;
  /** Wet/dry mix [0, 1]. Default: 0.5. */
  wetDry?: number;
}

/** Options for flanger. */
export interface FlangerOptions extends DelayOptions {
  /** Centre delay in milliseconds. Default: 2 ms. */
  centerDelayMs?: number;
  /** LFO rate in Hz. Default: 1.0 Hz. */
  modRateHz?: number;
  /** LFO depth in milliseconds (± this value). Default: 1.5 ms. */
  modDepthMs?: number;
  /**
   * Feedback coefficient (−1, 1). Positive = positive comb (metallic),
   * negative = negative comb (hollow). Default: 0.7.
   */
  feedback?: number;
  /** Wet/dry mix [0, 1]. Default: 0.5. */
  wetDry?: number;
}

/** Streaming delay processor — processes one block at a time. */
export interface DelayProcessor {
  /** Process a mono block and return processed output (same length). */
  process(input: Float32Array): Float32Array;
  /** Clear all delay buffer state. */
  reset(): void;
}

// ─── Internal delay buffer ────────────────────────────────────────────────────

/** Fixed-capacity circular delay buffer with linear interpolation. */
class DelayBuffer {
  private readonly _buf:  Float32Array;
  private readonly _mask: number;
  private _wPos: number = 0;

  constructor(maxDelaySamples: number) {
    const cap    = nextPow2(Math.max(2, maxDelaySamples + 2));
    this._buf    = new Float32Array(cap);
    this._mask   = cap - 1;
  }

  /** Write a sample at the current write position and advance. */
  write(value: number): void {
    this._buf[this._wPos & this._mask] = value;
    this._wPos++;
  }

  /**
   * Read from `delaySamples` in the past (fractional OK).
   * Call `write()` before `read()` in each sample loop.
   */
  read(delaySamples: number): number {
    const pos = (this._wPos - 1 - delaySamples);
    return readLinear(this._buf, this._mask, pos);
  }

  reset(): void {
    this._buf.fill(0);
    this._wPos = 0;
  }
}

// ─── Echo ─────────────────────────────────────────────────────────────────────

/**
 * Apply echo (feedback delay) to a mono signal.
 *
 * @param input    Mono input signal.
 * @param options  Echo parameters.
 * @returns        Processed signal (same length as input).
 */
export function applyEcho(
  input:   Float32Array,
  options: EchoOptions = {},
): Float32Array {
  const sr        = options.sampleRate  ?? 48000;
  const delayMs   = options.delayMs     ?? 300;
  const fb        = Math.max(0, Math.min(0.99, options.feedback ?? 0.4));
  const wet       = Math.max(0, Math.min(1, options.wetDry ?? 0.4));
  const dry       = 1 - wet;
  const maxMs     = options.maxDelayMs  ?? Math.max(2000, delayMs * 2);

  const delaySamp = delayMs * sr / 1000;
  const buf       = new DelayBuffer(Math.ceil(maxMs * sr / 1000));
  const out       = new Float32Array(input.length);

  for (let i = 0; i < input.length; i++) {
    const delayed = buf.read(delaySamp);
    const toWrite = input[i] + delayed * fb;
    buf.write(toWrite);
    out[i] = input[i] * dry + delayed * wet;
  }
  return out;
}

/**
 * Apply ping-pong stereo echo to a mono signal.
 *
 * Bounces between left and right channels on alternate echoes.
 *
 * @param input    Mono input signal.
 * @param options  Echo parameters.
 * @returns        `{ left, right }` stereo pair.
 */
export function applyPingPong(
  input:   Float32Array,
  options: EchoOptions = {},
): { left: Float32Array; right: Float32Array } {
  const sr        = options.sampleRate  ?? 48000;
  const delayMs   = options.delayMs     ?? 300;
  const fb        = Math.max(0, Math.min(0.99, options.feedback ?? 0.4));
  const wet       = Math.max(0, Math.min(1, options.wetDry ?? 0.4));
  const dry       = 1 - wet;
  const maxMs     = options.maxDelayMs  ?? Math.max(2000, delayMs * 2);

  const delaySamp = delayMs * sr / 1000;
  const bufL      = new DelayBuffer(Math.ceil(maxMs * sr / 1000));
  const bufR      = new DelayBuffer(Math.ceil(maxMs * sr / 1000));
  const left      = new Float32Array(input.length);
  const right     = new Float32Array(input.length);

  for (let i = 0; i < input.length; i++) {
    const delL = bufL.read(delaySamp);
    const delR = bufR.read(delaySamp);
    // Ping: input + L feedback goes to R; pong: R feedback goes to L
    bufL.write(input[i] + delR * fb);
    bufR.write(delL * fb);
    left[i]  = input[i] * dry + delL * wet;
    right[i] = input[i] * dry + delR * wet;
  }
  return { left, right };
}

// ─── Chorus ───────────────────────────────────────────────────────────────────

/**
 * Apply stereo chorus effect to a mono signal.
 *
 * Two modulated delay lines at quadrature (90° phase offset) create
 * a wide stereo spread with natural pitch modulation.
 *
 * @param input    Mono input signal.
 * @param options  Chorus parameters.
 * @returns        Stereo `{ left, right }` pair.
 */
export function applyChorus(
  input:   Float32Array,
  options: ChorusOptions = {},
): { left: Float32Array; right: Float32Array } {
  const sr          = options.sampleRate    ?? 48000;
  const centreMs    = options.centerDelayMs ?? 10;
  const rateHz      = options.modRateHz     ?? 0.5;
  const depthMs     = options.modDepthMs    ?? 5;
  const wet         = Math.max(0, Math.min(1, options.wetDry ?? 0.5));
  const dry         = 1 - wet;
  const maxMs       = options.maxDelayMs    ?? Math.max(200, (centreMs + depthMs) * 4);

  const centreSamp  = centreMs  * sr / 1000;
  const depthSamp   = depthMs   * sr / 1000;
  const lfoInc      = (2 * Math.PI * rateHz) / sr;
  const buf         = new DelayBuffer(Math.ceil(maxMs * sr / 1000));
  const left        = new Float32Array(input.length);
  const right       = new Float32Array(input.length);
  let   lfoPhase    = 0;

  for (let i = 0; i < input.length; i++) {
    buf.write(input[i]);
    // L: sin phase, R: cos phase (quadrature → wide stereo)
    const modL  = centreSamp + depthSamp * Math.sin(lfoPhase);
    const modR  = centreSamp + depthSamp * Math.cos(lfoPhase);
    const delL  = buf.read(modL);
    const delR  = buf.read(modR);
    left[i]     = input[i] * dry + delL * wet;
    right[i]    = input[i] * dry + delR * wet;
    lfoPhase   += lfoInc;
    if (lfoPhase >= Math.PI * 2) lfoPhase -= Math.PI * 2;
  }
  return { left, right };
}

// ─── Flanger ──────────────────────────────────────────────────────────────────

/**
 * Apply flanger effect to a mono signal.
 *
 * A very short (1–10 ms) modulated delay with feedback creates a sweeping
 * comb-filter effect ("jet plane" sound).
 *
 * @param input    Mono input signal.
 * @param options  Flanger parameters.
 * @returns        Processed mono signal (same length as input).
 */
export function applyFlanger(
  input:   Float32Array,
  options: FlangerOptions = {},
): Float32Array {
  const sr         = options.sampleRate    ?? 48000;
  const centreMs   = options.centerDelayMs ?? 2;
  const rateHz     = options.modRateHz     ?? 1.0;
  const depthMs    = options.modDepthMs    ?? 1.5;
  const fb         = Math.max(-0.99, Math.min(0.99, options.feedback ?? 0.7));
  const wet        = Math.max(0, Math.min(1, options.wetDry ?? 0.5));
  const dry        = 1 - wet;
  const maxMs      = options.maxDelayMs    ?? Math.max(100, (centreMs + depthMs) * 4);

  const centreSamp = centreMs  * sr / 1000;
  const depthSamp  = depthMs   * sr / 1000;
  const lfoInc     = (2 * Math.PI * rateHz) / sr;
  const buf        = new DelayBuffer(Math.ceil(maxMs * sr / 1000));
  const out        = new Float32Array(input.length);
  let   lfoPhase   = 0;

  for (let i = 0; i < input.length; i++) {
    const modD    = centreSamp + depthSamp * Math.sin(lfoPhase);
    const delayed = buf.read(modD);
    buf.write(input[i] + delayed * fb);
    out[i]       = input[i] * dry + delayed * wet;
    lfoPhase    += lfoInc;
    if (lfoPhase >= Math.PI * 2) lfoPhase -= Math.PI * 2;
  }
  return out;
}

// ─── Streaming API ────────────────────────────────────────────────────────────

/**
 * Create a streaming echo processor (persists delay buffer across blocks).
 *
 * @param options  Echo parameters.
 */
export function createEchoProcessor(options: EchoOptions = {}): DelayProcessor {
  const sr        = options.sampleRate  ?? 48000;
  const delayMs   = options.delayMs     ?? 300;
  const fb        = Math.max(0, Math.min(0.99, options.feedback ?? 0.4));
  const wet       = Math.max(0, Math.min(1, options.wetDry ?? 0.4));
  const dry       = 1 - wet;
  const maxMs     = options.maxDelayMs  ?? Math.max(2000, delayMs * 2);
  const delaySamp = delayMs * sr / 1000;
  const buf       = new DelayBuffer(Math.ceil(maxMs * sr / 1000));

  function process(input: Float32Array): Float32Array {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const delayed = buf.read(delaySamp);
      buf.write(input[i] + delayed * fb);
      out[i] = input[i] * dry + delayed * wet;
    }
    return out;
  }

  return { process, reset: () => buf.reset() };
}

/**
 * Create a streaming flanger processor.
 *
 * @param options  Flanger parameters.
 */
export function createFlangerProcessor(options: FlangerOptions = {}): DelayProcessor {
  const sr         = options.sampleRate    ?? 48000;
  const centreMs   = options.centerDelayMs ?? 2;
  const rateHz     = options.modRateHz     ?? 1.0;
  const depthMs    = options.modDepthMs    ?? 1.5;
  const fb         = Math.max(-0.99, Math.min(0.99, options.feedback ?? 0.7));
  const wet        = Math.max(0, Math.min(1, options.wetDry ?? 0.5));
  const dry        = 1 - wet;
  const maxMs      = options.maxDelayMs    ?? Math.max(100, (centreMs + depthMs) * 4);
  const centreSamp = centreMs  * sr / 1000;
  const depthSamp  = depthMs   * sr / 1000;
  const lfoInc     = (2 * Math.PI * rateHz) / sr;
  const buf        = new DelayBuffer(Math.ceil(maxMs * sr / 1000));
  let   lfoPhase   = 0;

  function process(input: Float32Array): Float32Array {
    const out = new Float32Array(input.length);
    for (let i = 0; i < input.length; i++) {
      const modD    = centreSamp + depthSamp * Math.sin(lfoPhase);
      const delayed = buf.read(modD);
      buf.write(input[i] + delayed * fb);
      out[i]       = input[i] * dry + delayed * wet;
      lfoPhase    += lfoInc;
      if (lfoPhase >= Math.PI * 2) lfoPhase -= Math.PI * 2;
    }
    return out;
  }

  function reset(): void {
    buf.reset();
    lfoPhase = 0;
  }

  return { process, reset };
}
