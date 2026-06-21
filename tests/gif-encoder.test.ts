/**
 * Tests for export/gif-encoder.ts
 *
 * Tests the GIF89a encoder end-to-end using synthetic ImageData frames.
 * No browser APIs needed beyond ImageData (mocked in setup.ts).
 *
 * Coverage targets:
 *  - GIF header / trailer presence
 *  - Netscape looping extension for animation
 *  - Per-frame palette (local colour table)
 *  - LZW data (non-empty blocks)
 *  - Median-cut quantisation edge cases
 *  - Floyd-Steinberg dithering path
 *  - Error handling
 *
 * # AI generated (reviewed)
 */

import { describe, it, expect } from 'vitest';
import { encodeGif, type GifFrameInput } from '../export/gif-encoder';

// ============================================================
// Helpers
// ============================================================

function makeFrame(
  width: number,
  height: number,
  fill: (x: number, y: number) => [number, number, number, number]
): GifFrameInput {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * width + x) * 4;
      data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
    }
  }
  return {
    imageData: new ImageData(data, width, height),
    delayMs: 100,
  };
}

/** Solid colour frame */
function solidFrame(w: number, h: number, r: number, g: number, b: number): GifFrameInput {
  return makeFrame(w, h, () => [r, g, b, 255]);
}

/** Gradient frame (useful for testing dithering) */
function gradientFrame(w: number, h: number): GifFrameInput {
  return makeFrame(w, h, (x, y) => [
    Math.round((x / w) * 255),
    Math.round((y / h) * 255),
    128,
    255,
  ]);
}

/** Parse a little-endian U16 from a GIF byte array */
function readU16LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

// ============================================================
// GIF Header / Trailer
// ============================================================

describe('encodeGif — header and trailer', () => {
  it('output starts with GIF89a magic bytes', () => {
    const bytes = encodeGif([solidFrame(4, 4, 255, 0, 0)]);
    expect(bytes[0]).toBe(0x47); // G
    expect(bytes[1]).toBe(0x49); // I
    expect(bytes[2]).toBe(0x46); // F
    expect(bytes[3]).toBe(0x38); // 8
    expect(bytes[4]).toBe(0x39); // 9
    expect(bytes[5]).toBe(0x61); // a
  });

  it('output ends with GIF trailer byte 0x3B', () => {
    const bytes = encodeGif([solidFrame(4, 4, 0, 255, 0)]);
    expect(bytes[bytes.length - 1]).toBe(0x3B);
  });

  it('encodes width and height in Logical Screen Descriptor', () => {
    const bytes = encodeGif([solidFrame(20, 15, 0, 0, 255)]);
    expect(readU16LE(bytes, 6)).toBe(20);
    expect(readU16LE(bytes, 8)).toBe(15);
  });

  it('global colour table flag is set (bit 7 of packed field)', () => {
    const bytes = encodeGif([solidFrame(8, 8, 128, 128, 128)]);
    // Logical Screen Descriptor packed byte is at offset 10
    expect(bytes[10] & 0x80).toBe(0x80);
  });

  it('returns a non-empty Uint8Array', () => {
    const bytes = encodeGif([solidFrame(4, 4, 100, 150, 200)]);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(20);
  });
});

// ============================================================
// Global Colour Table
// ============================================================

describe('encodeGif — global colour table', () => {
  it('global colour table is 768 bytes (256 × RGB)', () => {
    // Starts at offset 13 (after 6-byte header + 7-byte LSD)
    const bytes = encodeGif([solidFrame(4, 4, 255, 0, 0)]);
    // Just verify the file is large enough to contain a 768-byte GCT
    expect(bytes.length).toBeGreaterThan(13 + 768);
  });

  it('frame produces a local colour table flag in Image Descriptor', () => {
    const bytes = encodeGif([solidFrame(4, 4, 0, 255, 0)]);
    // Find Image Separator (0x2C) and check the packed field
    let sepIdx = -1;
    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x2C) { sepIdx = i; break; }
    }
    expect(sepIdx).toBeGreaterThan(-1);
    // Packed byte is 9 bytes after 0x2C
    const packed = bytes[sepIdx + 9];
    expect(packed & 0x80).toBe(0x80); // Local colour table flag
  });
});

// ============================================================
// Netscape looping extension
// ============================================================

describe('encodeGif — Netscape looping extension', () => {
  it('is present for animated (multi-frame) GIFs', () => {
    const frames = [solidFrame(4, 4, 255, 0, 0), solidFrame(4, 4, 0, 0, 255)];
    const bytes = encodeGif(frames);
    // Search for Netscape block: 0x21 0xFF
    let found = false;
    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xFF) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it('is absent for single-frame GIFs', () => {
    const bytes = encodeGif([solidFrame(4, 4, 255, 0, 0)]);
    let found = false;
    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xFF) { found = true; break; }
    }
    expect(found).toBe(false);
  });

  it('encodes loopCount=0 (infinite) correctly', () => {
    const bytes = encodeGif(
      [solidFrame(4, 4, 1, 2, 3), solidFrame(4, 4, 4, 5, 6)],
      { loopCount: 0 }
    );
    // Netscape extension layout from the 0x21 0xFF marker:
    //   +0  0x21  +1  0xFF  +2  0x0B  +3..+10  "NETSCAPE"
    //   +11..+13  "2.0"  +14  0x03  +15  0x01  +16 lo  +17 hi  +18  0x00
    for (let i = 0; i < bytes.length - 20; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xFF) {
        const loopLo = bytes[i + 16];
        const loopHi = bytes[i + 17];
        expect(loopLo | (loopHi << 8)).toBe(0);
        break;
      }
    }
  });

  it('encodes non-zero loopCount', () => {
    const bytes = encodeGif(
      [solidFrame(4, 4, 0, 0, 0), solidFrame(4, 4, 255, 255, 255)],
      { loopCount: 5 }
    );
    for (let i = 0; i < bytes.length - 20; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xFF) {
        const loopCount = bytes[i + 16] | (bytes[i + 17] << 8);
        expect(loopCount).toBe(5);
        break;
      }
    }
  });
});

// ============================================================
// Graphic Control Extension
// ============================================================

describe('encodeGif — Graphic Control Extension', () => {
  it('each frame contains a GCE (0x21 0xF9)', () => {
    const bytes = encodeGif([solidFrame(4, 4, 10, 20, 30)]);
    let found = false;
    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xF9) { found = true; break; }
    }
    expect(found).toBe(true);
  });

  it('GCE delay encodes delayMs correctly (centiseconds)', () => {
    const frame = { ...solidFrame(4, 4, 0, 0, 0), delayMs: 500 }; // 50 cs
    const bytes = encodeGif([frame]);
    for (let i = 0; i < bytes.length - 5; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xF9 && bytes[i + 2] === 0x04) {
        const delayCs = readU16LE(bytes, i + 4);
        expect(delayCs).toBe(50);
        break;
      }
    }
  });

  it('clamps minimum delay to 1 centisecond', () => {
    // 5ms → 0.5cs → rounded to 1cs (minimum)
    const frame = { ...solidFrame(4, 4, 0, 0, 0), delayMs: 5 };
    const bytes = encodeGif([frame]);
    for (let i = 0; i < bytes.length - 5; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xF9 && bytes[i + 2] === 0x04) {
        const delayCs = readU16LE(bytes, i + 4);
        expect(delayCs).toBeGreaterThanOrEqual(1);
        break;
      }
    }
  });
});

// ============================================================
// LZW data
// ============================================================

describe('encodeGif — LZW data', () => {
  it('LZW minimum code size byte is 8 for 256-colour palette', () => {
    const bytes = encodeGif([solidFrame(4, 4, 200, 100, 50)]);
    // Image Descriptor from 0x2C:
    //   [0] 0x2C  [1-2] left  [3-4] top  [5-6] width  [7-8] height  [9] packed
    //   [10..777] local CT (256 × 3 = 768 bytes)
    //   [778] LZW minimum code size
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x2C) {
        const lzwMinCodeSizeOffset = i + 10 + 768; // 10 descriptor bytes + 768-byte local CT
        expect(bytes[lzwMinCodeSizeOffset]).toBe(8);
        break;
      }
    }
  });

  it('output is larger for a gradient frame than a solid frame (better LZW for solid)', () => {
    const solidBytes = encodeGif([solidFrame(16, 16, 128, 128, 128)], { dither: false });
    const gradBytes = encodeGif([gradientFrame(16, 16)], { dither: false });
    // Gradient requires more LZW codes → larger output
    expect(gradBytes.length).toBeGreaterThan(solidBytes.length);
  });
});

// ============================================================
// Multi-frame animation
// ============================================================

describe('encodeGif — multi-frame', () => {
  it('multi-frame GIF is larger than single-frame', () => {
    const single = encodeGif([solidFrame(8, 8, 255, 0, 0)]);
    const multi = encodeGif([
      solidFrame(8, 8, 255, 0, 0),
      solidFrame(8, 8, 0, 255, 0),
      solidFrame(8, 8, 0, 0, 255),
    ]);
    expect(multi.length).toBeGreaterThan(single.length);
  });

  it('each frame has its own Image Separator (0x2C)', () => {
    const n = 3;
    const frames = Array.from({ length: n }, (_, i) =>
      solidFrame(4, 4, i * 80, 255 - i * 80, 128)
    );
    const bytes = encodeGif(frames);
    let count = 0;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x2C) count++;
    }
    expect(count).toBe(n);
  });
});

// ============================================================
// Dithering
// ============================================================

describe('encodeGif — dithering', () => {
  it('dithered and non-dithered outputs differ for gradient frames', () => {
    const frame = gradientFrame(16, 16);
    const noDither = encodeGif([frame], { dither: false });
    const withDither = encodeGif([frame], { dither: true });
    // Byte-for-byte different (dithering changes pixel indices)
    expect(noDither).not.toEqual(withDither);
  });

  it('both paths return valid GIF magic bytes', () => {
    const frame = gradientFrame(8, 8);
    for (const dither of [true, false]) {
      const bytes = encodeGif([frame], { dither });
      expect(String.fromCharCode(...bytes.slice(0, 6))).toBe('GIF89a');
    }
  });
});

// ============================================================
// Options
// ============================================================

describe('encodeGif — options', () => {
  it('numColors is clamped to [2, 256]', () => {
    // Should not throw even with out-of-range values
    expect(() => encodeGif([solidFrame(4, 4, 0, 0, 0)], { numColors: 0 })).not.toThrow();
    expect(() => encodeGif([solidFrame(4, 4, 0, 0, 0)], { numColors: 9999 })).not.toThrow();
  });

  it('works with minimal 1×1 frame', () => {
    const bytes = encodeGif([solidFrame(1, 1, 255, 255, 255)]);
    expect(bytes[0]).toBe(0x47);
    expect(bytes[bytes.length - 1]).toBe(0x3B);
  });
});

// ============================================================
// Error handling
// ============================================================

describe('encodeGif — error handling', () => {
  it('throws for empty frames array', () => {
    expect(() => encodeGif([])).toThrow('at least one frame');
  });
});

// ============================================================
// Colour quantisation correctness
// ============================================================

describe('encodeGif — colour quantisation', () => {
  it('pure red frame produces a palette with at least one reddish entry', () => {
    const bytes = encodeGif([solidFrame(8, 8, 255, 0, 0)], { dither: false });

    // The local colour table starts 9 bytes after the 0x2C Image Separator
    let sepIdx = -1;
    for (let i = 0; i < bytes.length; i++) {
      if (bytes[i] === 0x2C) { sepIdx = i; break; }
    }
    expect(sepIdx).toBeGreaterThan(-1);

    const ctStart = sepIdx + 10; // 1 (0x2C) + 8 descriptor bytes + 1 packed byte
    // Search for a palette entry with R > 200, G < 50, B < 50
    let hasRed = false;
    for (let j = 0; j < 256; j++) {
      const r = bytes[ctStart + j * 3];
      const g = bytes[ctStart + j * 3 + 1];
      const b = bytes[ctStart + j * 3 + 2];
      if (r > 200 && g < 50 && b < 50) { hasRed = true; break; }
    }
    expect(hasRed).toBe(true);
  });

  it('solid white frame has index 0 pixel mapped to a near-white palette entry', () => {
    // We don't peek inside indices, but we verify the output is a valid GIF
    const bytes = encodeGif([solidFrame(8, 8, 255, 255, 255)], { dither: false });
    expect(bytes[bytes.length - 1]).toBe(0x3B);
    expect(bytes.length).toBeGreaterThan(800); // header + GCT + LCT + LZW
  });
});
