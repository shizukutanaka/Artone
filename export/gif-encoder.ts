/**
 * Artone GIF89a Encoder
 *
 * Self-contained animated GIF encoder — no external dependencies.
 *
 * Pipeline per frame:
 *   1. Sample every 4th pixel for speed
 *   2. Median-cut quantisation → per-frame 256-colour palette
 *   3. Build 32³ nearest-colour lookup table for O(1) pixel→index mapping
 *   4. Optional Floyd-Steinberg dithering for smooth gradients
 *   5. LZW compression (variable-width codes, LSB-first bit packing)
 *   6. Assemble GIF89a binary with Netscape 2.0 looping extension
 *
 * # AI generated (reviewed)
 */

// ============================================================
// Types
// ============================================================

type RGB = [number, number, number];

export interface GifFrameInput {
  imageData: ImageData;
  /** Frame delay in milliseconds */
  delayMs: number;
}

export interface GifEncodeOptions {
  /** Max colours per frame (2–256). Rounded up to nearest power of 2. Default: 256 */
  numColors?: number;
  /** Enable Floyd-Steinberg dithering (better gradients, ~2× slower). Default: true */
  dither?: boolean;
  /** Animation loop count (0 = infinite). Default: 0 */
  loopCount?: number;
}

// ============================================================
// Median-cut colour quantisation
// ============================================================

interface ColorBox {
  colors: RGB[];
  rMin: number; rMax: number;
  gMin: number; gMax: number;
  bMin: number; bMax: number;
}

function makeColorBox(colors: RGB[]): ColorBox {
  let rMin = 255, rMax = 0, gMin = 255, gMax = 0, bMin = 255, bMax = 0;
  for (const [r, g, b] of colors) {
    if (r < rMin) rMin = r; if (r > rMax) rMax = r;
    if (g < gMin) gMin = g; if (g > gMax) gMax = g;
    if (b < bMin) bMin = b; if (b > bMax) bMax = b;
  }
  return { colors, rMin, rMax, gMin, gMax, bMin, bMax };
}

/**
 * Median-cut algorithm: partitions colour space into `maxColors` boxes and
 * returns the average RGB of each box as the palette.
 */
function medianCut(pixels: RGB[], maxColors: number): RGB[] {
  if (pixels.length === 0) {
    const empty: RGB[] = [];
    for (let i = 0; i < maxColors; i++) empty.push([0, 0, 0]);
    return empty;
  }

  const boxes: ColorBox[] = [makeColorBox(pixels)];

  while (boxes.length < maxColors) {
    // Find the box with the largest colour range
    let maxRange = -1;
    let maxIdx = -1;
    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.colors.length < 2) continue;
      const range = Math.max(b.rMax - b.rMin, b.gMax - b.gMin, b.bMax - b.bMin);
      if (range > maxRange) { maxRange = range; maxIdx = i; }
    }
    if (maxIdx < 0) break; // All boxes are single-colour

    const box = boxes[maxIdx];
    const rR = box.rMax - box.rMin;
    const gR = box.gMax - box.gMin;
    const bR = box.bMax - box.bMin;

    // Sort along the longest axis and split at the median
    const axis: 0 | 1 | 2 = rR >= gR && rR >= bR ? 0 : gR >= bR ? 1 : 2;
    const sorted = [...box.colors].sort((a, c) => a[axis] - c[axis]);
    const mid = sorted.length >> 1;

    boxes.splice(maxIdx, 1,
      makeColorBox(sorted.slice(0, mid)),
      makeColorBox(sorted.slice(mid))
    );
  }

  const palette: RGB[] = boxes.map(box => {
    const n = box.colors.length;
    let rS = 0, gS = 0, bS = 0;
    for (const [r, g, b] of box.colors) { rS += r; gS += g; bS += b; }
    return [Math.round(rS / n), Math.round(gS / n), Math.round(bS / n)] as RGB;
  });

  // Pad palette to exactly maxColors entries
  while (palette.length < maxColors) palette.push([0, 0, 0]);
  return palette;
}

// ============================================================
// 32³ nearest-colour lookup table
//
// Buckets 5 bits per channel (32 levels each). For a 256-entry palette this
// requires 32³ × 256 = 8.4M comparisons to build — fast enough for export.
// Lookup is O(1): lut[ (r >> 3) * 1024 + (g >> 3) * 32 + (b >> 3) ]
// ============================================================

function buildLUT(palette: RGB[]): Uint8Array {
  const lut = new Uint8Array(32 * 32 * 32);
  for (let ri = 0; ri < 32; ri++) {
    const r = (ri << 3) | 4; // centroid of 8-value bucket
    for (let gi = 0; gi < 32; gi++) {
      const g = (gi << 3) | 4;
      for (let bi = 0; bi < 32; bi++) {
        const b = (bi << 3) | 4;
        let best = 0;
        let bestDist = Infinity;
        for (let j = 0; j < palette.length; j++) {
          const dr = r - palette[j][0];
          const dg = g - palette[j][1];
          const db = b - palette[j][2];
          const dist = dr * dr + dg * dg + db * db;
          if (dist < bestDist) { bestDist = dist; best = j; }
        }
        lut[ri * 1024 + gi * 32 + bi] = best;
      }
    }
  }
  return lut;
}

// ============================================================
// Pixel mapping (with optional Floyd-Steinberg dithering)
// ============================================================

function mapPixelsDirect(
  data: Uint8ClampedArray,
  numPixels: number,
  lut: Uint8Array
): Uint8Array {
  const indices = new Uint8Array(numPixels);
  for (let i = 0; i < numPixels; i++) {
    indices[i] = lut[
      Math.min(31, data[i * 4] >> 3) * 1024 +
      Math.min(31, data[i * 4 + 1] >> 3) * 32 +
      Math.min(31, data[i * 4 + 2] >> 3)
    ];
  }
  return indices;
}

function mapPixelsDithered(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  palette: RGB[],
  lut: Uint8Array
): Uint8Array {
  const numPixels = width * height;
  const indices = new Uint8Array(numPixels);
  // Error buffer stored as float triplets [r, g, b, r, g, b, ...]
  const err = new Float32Array(numPixels * 3);

  // Seed error buffer with original pixel values
  for (let i = 0; i < numPixels; i++) {
    err[i * 3] = data[i * 4];
    err[i * 3 + 1] = data[i * 4 + 1];
    err[i * 3 + 2] = data[i * 4 + 2];
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pi = y * width + x;
      const oldR = Math.max(0, Math.min(255, err[pi * 3]));
      const oldG = Math.max(0, Math.min(255, err[pi * 3 + 1]));
      const oldB = Math.max(0, Math.min(255, err[pi * 3 + 2]));

      const idx = lut[
        Math.min(31, oldR >> 3) * 1024 +
        Math.min(31, oldG >> 3) * 32 +
        Math.min(31, oldB >> 3)
      ];
      indices[pi] = idx;

      const errR = oldR - palette[idx][0];
      const errG = oldG - palette[idx][1];
      const errB = oldB - palette[idx][2];

      // Floyd-Steinberg kernel: distribute error to 4 neighbours (inlined for throughput)
      let np: number;
      if (x + 1 < width) {
        np = (pi + 1) * 3;
        err[np] += errR * 0.4375; err[np + 1] += errG * 0.4375; err[np + 2] += errB * 0.4375;
      }
      if (x > 0 && y + 1 < height) {
        np = (pi + width - 1) * 3;
        err[np] += errR * 0.1875; err[np + 1] += errG * 0.1875; err[np + 2] += errB * 0.1875;
      }
      if (y + 1 < height) {
        np = (pi + width) * 3;
        err[np] += errR * 0.3125; err[np + 1] += errG * 0.3125; err[np + 2] += errB * 0.3125;
      }
      if (x + 1 < width && y + 1 < height) {
        np = (pi + width + 1) * 3;
        err[np] += errR * 0.0625; err[np + 1] += errG * 0.0625; err[np + 2] += errB * 0.0625;
      }
    }
  }

  return indices;
}

// ============================================================
// LZW compression (GIF variant)
//
// Key: (prefix_code << 8) | suffix_byte — injective for prefix < 4096, suffix < 256.
// Codes are packed LSB-first as required by GIF89a.
// ============================================================

function lzwCompress(indices: Uint8Array, minCodeSize: number): Uint8Array {
  const clearCode = 1 << minCodeSize;
  const eofCode = clearCode + 1;

  // Pre-allocate: worst case each pixel produces at most 2 bytes at max code width (12 bits)
  const output = new Uint8Array(indices.length * 2 + 512);
  let outPos = 0;
  let codeSize = minCodeSize + 1;
  let nextCode = eofCode + 1;
  let bitBuf = 0;
  let bitCount = 0;

  const codeTable = new Map<number, number>();

  function resetTable(): void {
    codeTable.clear();
    codeSize = minCodeSize + 1;
    nextCode = eofCode + 1;
  }

  function writeCode(code: number): void {
    bitBuf |= code << bitCount;
    bitCount += codeSize;
    while (bitCount >= 8) {
      output[outPos++] = bitBuf & 0xFF;
      bitBuf >>>= 8;
      bitCount -= 8;
    }
  }

  resetTable();
  writeCode(clearCode);

  if (indices.length === 0) {
    writeCode(eofCode);
    if (bitCount > 0) output[outPos++] = bitBuf & 0xFF;
    return output.subarray(0, outPos);
  }

  let prefix = indices[0];

  for (let i = 1; i < indices.length; i++) {
    const k = indices[i];
    const key = (prefix << 8) | k;
    const cached = codeTable.get(key);

    if (cached !== undefined) {
      prefix = cached;
    } else {
      writeCode(prefix);

      if (nextCode < 4096) {
        codeTable.set(key, nextCode++);
        if (nextCode > (1 << codeSize) && codeSize < 12) codeSize++;
      } else {
        // Table full — emit clear code and restart
        writeCode(clearCode);
        resetTable();
      }

      prefix = k;
    }
  }

  writeCode(prefix);
  writeCode(eofCode);
  if (bitCount > 0) output[outPos++] = bitBuf & 0xFF;

  return output.subarray(0, outPos);
}

// ============================================================
// GIF89a binary helpers
// ============================================================

function u16LE(value: number): [number, number] {
  return [value & 0xFF, (value >> 8) & 0xFF];
}

/**
 * GIF color tables must be a power-of-two size in {2,4,...,256} — the GCT/LCT
 * packed byte's 3-bit "size" field N encodes an actual table size of
 * 2^(N+1). By convention the LZW minimum code size (also derived from N) is
 * never below 2 (some decoders reject 1), so tables are floored at 4 entries.
 *
 * REGRESSION fix: gifHeader/frameBlock used to hardcode the size field (and
 * lzwCompress's minCodeSize) for a 256-entry table regardless of the actual
 * palette length. For any GifEncodeOptions.numColors < 256 (a documented,
 * public 2-256 range), the header/image-descriptor declared a 256-entry
 * (768-byte) color table while only numColors*3 bytes were actually written
 * — a decoder reads the following stream bytes as palette data, producing a
 * corrupt file.
 */
function colorTableSize(requestedColors: number): { n: number; size: number } {
  let n = 1; // size 4 — the LZW-min-code-size-2 floor
  while ((1 << (n + 1)) < requestedColors && n < 7) n++;
  return { n, size: 1 << (n + 1) };
}

function gifHeader(width: number, height: number, globalPalette: RGB[], n: number): number[] {
  const out = [
    0x47, 0x49, 0x46, 0x38, 0x39, 0x61, // "GIF89a"
    ...u16LE(width),
    ...u16LE(height),
    0x80 | (n << 4) | n, // GCT flag=1, color resolution=N, sort=0, size=N
    0x00, // background color index
    0x00, // pixel aspect ratio
  ];
  for (const [r, g, b] of globalPalette) out.push(r, g, b);
  return out;
}

function netscapeExtension(loopCount: number): number[] {
  return [
    0x21, 0xFF, 0x0B,                                     // App extension
    0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45,     // "NETSCAPE"
    0x32, 0x2E, 0x30,                                     // "2.0"
    0x03, 0x01, ...u16LE(loopCount),                      // loop count
    0x00,                                                  // block terminator
  ];
}

interface FrameBlockInput {
  width: number;
  height: number;
  localPalette: RGB[];
  indices: Uint8Array;
  delayCs: number;
  /** Color table size field (table size = 2^(n+1)); see colorTableSize(). */
  n: number;
}

function frameBlock({ width, height, localPalette, indices, delayCs, n }: FrameBlockInput): number[] {
  const out = [
    // Graphic Control Extension
    0x21, 0xF9, 0x04,
    0x04,               // disposal: restore to background
    ...u16LE(delayCs),
    0xFF,               // transparent colour index (unused)
    0x00,               // block terminator

    // Image Descriptor
    0x2C,
    ...u16LE(0), ...u16LE(0),         // left, top
    ...u16LE(width), ...u16LE(height),
    0x80 | n,           // local color table present, size = 2^(n+1) entries
  ];

  // Local Color Table (2^(n+1) × 3 bytes — must match localPalette.length exactly)
  for (const [r, g, b] of localPalette) out.push(r, g, b);

  // LZW Image Data (minCodeSize derived from the same N as the color table size)
  const minCodeSize = n + 1;
  const lzwData = lzwCompress(indices, minCodeSize);
  out.push(minCodeSize); // LZW minimum code size

  for (let offset = 0; offset < lzwData.length; offset += 255) {
    const blockSize = Math.min(255, lzwData.length - offset);
    out.push(blockSize);
    for (let j = 0; j < blockSize; j++) out.push(lzwData[offset + j]);
  }
  out.push(0x00); // block terminator

  return out;
}

// ============================================================
// Public API
// ============================================================

/**
 * Encodes an array of ImageData frames into an animated GIF89a binary.
 * Returns a Uint8Array that can be wrapped in `new Blob([result], { type: 'image/gif' })`.
 *
 * @throws if `frames` is empty
 */
export function encodeGif(frames: GifFrameInput[], opts: GifEncodeOptions = {}): Uint8Array {
  if (frames.length === 0) throw new Error('GIF encoder: at least one frame required');

  const requestedColors = Math.min(256, Math.max(2, opts.numColors ?? 256));
  // Color table size (and LZW minCodeSize) must be a power of two — see
  // colorTableSize()'s doc comment. medianCut is asked for exactly
  // `tableSize` entries so the palette length always matches what the
  // header/image-descriptor declare.
  const { n, size: tableSize } = colorTableSize(requestedColors);
  const dither = opts.dither ?? true;
  const loopCount = opts.loopCount ?? 0;

  const { width, height } = frames[0].imageData;

  // Process all frames: quantise and LZW-encode
  const processed: Array<{ palette: RGB[]; indices: Uint8Array; delayCs: number }> = [];

  for (const { imageData, delayMs } of frames) {
    const numPixels = imageData.width * imageData.height;

    // Sample every 4th pixel to build palette (4× speed-up; quality loss negligible)
    const sampled: RGB[] = [];
    for (let i = 0; i < numPixels; i += 4) {
      sampled.push([imageData.data[i * 4], imageData.data[i * 4 + 1], imageData.data[i * 4 + 2]]);
    }

    const palette = medianCut(sampled, tableSize);
    const lut = buildLUT(palette);
    const indices = dither
      ? mapPixelsDithered(imageData.data, imageData.width, imageData.height, palette, lut)
      : mapPixelsDirect(imageData.data, numPixels, lut);

    processed.push({ palette, indices, delayCs: Math.max(1, Math.round(delayMs / 10)) });
  }

  // Assemble GIF89a binary
  const parts: number[][] = [
    gifHeader(width, height, processed[0].palette, n),
  ];
  if (frames.length > 1) parts.push(netscapeExtension(loopCount));
  for (const f of processed) {
    parts.push(frameBlock({ width, height, localPalette: f.palette, indices: f.indices, delayCs: f.delayCs, n }));
  }
  parts.push([0x3B]); // GIF trailer

  const totalLength = parts.reduce((s, p) => s + p.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}
