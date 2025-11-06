/**
 * Advanced Color Correction and Grading System for Artone Video Editor
 * Professional-grade color tools with LUT support, scopes, and real-time preview
 */

export class ColorCorrectionEngine {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.videoElement = null;
    this.currentFrame = null;

    // Color correction parameters
    this.params = {
      brightness: 0,
      contrast: 1,
      saturation: 1,
      hue: 0,
      temperature: 0,
      tint: 0,
      highlights: 0,
      shadows: 0,
      whites: 0,
      blacks: 0,
      vibrance: 0,
      clarity: 0,
      sharpness: 0,
      grain: 0,
      vignette: 0
    };

    // LUT (Look Up Table) support
    this.luts = new Map();
    this.currentLut = null;

    // Scopes for monitoring
    this.scopes = {
      waveform: null,
      vectorscope: null,
      histogram: null,
      rgbParade: null
    };

    this.initialize();
  }

  initialize() {
    this.loadDefaultLUTs();
    this.setupEventListeners();
  }

  loadDefaultLUTs() {
    // Load common LUTs
    const defaultLuts = [
      { name: 'none', data: null },
      { name: 'cineon', data: this.generateCineonLUT() },
      { name: 'teal-orange', data: this.generateTealOrangeLUT() },
      { name: 'vintage', data: this.generateVintageLUT() }
    ];

    defaultLuts.forEach(lut => {
      this.luts.set(lut.name, lut.data);
    });
  }

  generateCineonLUT() {
    // Simplified Cineon-style LUT generation
    const lut = new Uint8ClampedArray(32 * 32 * 32 * 4);
    for (let r = 0; r < 32; r++) {
      for (let g = 0; g < 32; g++) {
        for (let b = 0; b < 32; b++) {
          const index = (r * 32 * 32 + g * 32 + b) * 4;
          // Apply film-like curve
          const rf = this.cineonCurve(r / 31);
          const gf = this.cineonCurve(g / 31);
          const bf = this.cineonCurve(b / 31);

          lut[index] = Math.round(rf * 255);
          lut[index + 1] = Math.round(gf * 255);
          lut[index + 2] = Math.round(bf * 255);
          lut[index + 3] = 255;
        }
      }
    }
    return lut;
  }

  cineonCurve(value) {
    // Cineon film curve approximation
    return value <= 0.149658 ? (value - 0.092864) / 5.0 : Math.pow((value + 0.092864) / 1.092864, 1 / 2.2);
  }

  generateTealOrangeLUT() {
    // Teal and orange color grade LUT
    const lut = new Uint8ClampedArray(32 * 32 * 32 * 4);
    for (let r = 0; r < 32; r++) {
      for (let g = 0; g < 32; g++) {
        for (let b = 0; b < 32; b++) {
          const index = (r * 32 * 32 + g * 32 + b) * 4;

          // Enhance orange tones (high R, medium G, low B)
          let rf = r / 31;
          let gf = g / 31;
          let bf = b / 31;

          if (rf > gf && rf > bf && gf > bf) {
            // Orange tones - boost red and green
            rf = Math.min(1, rf * 1.2);
            gf = Math.min(1, gf * 1.1);
            bf = Math.max(0, bf * 0.8);
          } else if (bf > rf && bf > gf) {
            // Blue tones - shift to teal
            rf = Math.max(0, rf * 0.7);
            gf = Math.min(1, gf * 1.3);
            bf = Math.min(1, bf * 1.1);
          }

          lut[index] = Math.round(rf * 255);
          lut[index + 1] = Math.round(gf * 255);
          lut[index + 2] = Math.round(bf * 255);
          lut[index + 3] = 255;
        }
      }
    }
    return lut;
  }

  generateVintageLUT() {
    // Vintage film look LUT
    const lut = new Uint8ClampedArray(32 * 32 * 32 * 4);
    for (let r = 0; r < 32; r++) {
      for (let g = 0; g < 32; g++) {
        for (let b = 0; b < 32; b++) {
          const index = (r * 32 * 32 + g * 32 + b) * 4;

          // Reduce saturation and add warm tint
          let rf = r / 31;
          let gf = g / 31;
          let bf = b / 31;

          // Desaturate
          const avg = (rf + gf + bf) / 3;
          rf = avg * 0.7 + rf * 0.3;
          gf = avg * 0.7 + gf * 0.3;
          bf = avg * 0.7 + bf * 0.3;

          // Warm tint
          rf = Math.min(1, rf * 1.1);
          gf = Math.min(1, gf * 1.05);

          lut[index] = Math.round(rf * 255);
          lut[index + 1] = Math.round(gf * 255);
          lut[index + 2] = Math.round(bf * 255);
          lut[index + 3] = 255;
        }
      }
    }
    return lut;
  }

  applyColorCorrection(imageData) {
    const data = imageData.data;
    const lut = this.currentLut;

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      // Apply basic corrections
      r = this.applyBrightnessContrast(r, this.params.brightness, this.params.contrast);
      g = this.applyBrightnessContrast(g, this.params.brightness, this.params.contrast);
      b = this.applyBrightnessContrast(b, this.params.brightness, this.params.contrast);

      // Apply saturation
      const avg = (r + g + b) / 3;
      r = avg + (r - avg) * this.params.saturation;
      g = avg + (g - avg) * this.params.saturation;
      b = avg + (b - avg) * this.params.saturation;

      // Apply hue shift
      const { r: hr, g: hg, b: hb } = this.applyHueShift(r, g, b, this.params.hue);
      r = hr;
      g = hg;
      b = hb;

      // Apply temperature and tint
      r += this.params.temperature * 0.01;
      b -= this.params.temperature * 0.01;
      g += this.params.tint * 0.01;

      // Apply highlights and shadows
      r = this.applyHighlightsShadows(r, this.params.highlights, this.params.shadows);
      g = this.applyHighlightsShadows(g, this.params.highlights, this.params.shadows);
      b = this.applyHighlightsShadows(b, this.params.highlights, this.params.shadows);

      // Apply LUT if available
      if (lut) {
        const { r: lr, g: lg, b: lb } = this.applyLUT(r, g, b, lut);
        r = lr;
        g = lg;
        b = lb;
      }

      // Clamp values
      r = Math.max(0, Math.min(1, r));
      g = Math.max(0, Math.min(1, g));
      b = Math.max(0, Math.min(1, b));

      data[i] = Math.round(r * 255);
      data[i + 1] = Math.round(g * 255);
      data[i + 2] = Math.round(b * 255);
    }

    return imageData;
  }

  applyBrightnessContrast(value, brightness, contrast) {
    // Apply brightness
    value += brightness / 100;

    // Apply contrast
    value = (value - 0.5) * contrast + 0.5;

    return value;
  }

  applyHueShift(r, g, b, hue) {
    const cos = Math.cos(hue);
    const sin = Math.sin(hue);

    return {
      r: r * (0.299 + 0.701 * cos - 0.168 * sin) +
         g * (0.587 - 0.587 * cos + 0.330 * sin) +
         b * (0.114 - 0.114 * cos - 0.497 * sin),
      g: r * (0.299 - 0.299 * cos - 0.328 * sin) +
         g * (0.587 + 0.413 * cos + 0.035 * sin) +
         b * (0.114 - 0.114 * cos + 0.292 * sin),
      b: r * (0.299 - 0.299 * cos + 1.250 * sin) +
         g * (0.587 - 0.587 * cos - 1.050 * sin) +
         b * (0.114 + 0.886 * cos - 0.203 * sin)
    };
  }

  applyHighlightsShadows(value, highlights, shadows) {
    if (value > 0.5) {
      // Highlights
      value = 0.5 + (value - 0.5) * (1 + highlights / 100);
    } else {
      // Shadows
      value = value * (1 + shadows / 100);
    }
    return value;
  }

  applyLUT(r, g, b, lut) {
    // Trilinear interpolation for LUT lookup
    const size = 32;
    const rIdx = Math.floor(r * (size - 1));
    const gIdx = Math.floor(g * (size - 1));
    const bIdx = Math.floor(b * (size - 1));

    const rFrac = (r * (size - 1)) - rIdx;
    const gFrac = (g * (size - 1)) - gIdx;
    const bFrac = (b * (size - 1)) - bIdx;

    const index = (rIdx * size * size + gIdx * size + bIdx) * 4;

    // Simple nearest neighbor for this example
    const lr = lut[index] / 255;
    const lg = lut[index + 1] / 255;
    const lb = lut[index + 2] / 255;

    return { r: lr, g: lg, b: lb };
  }

  setParameter(param, value) {
    if (this.params.hasOwnProperty(param)) {
      this.params[param] = value;
      this.emit('parameter-changed', { param, value });
    }
  }

  setLUT(lutName) {
    this.currentLut = this.luts.get(lutName) || null;
    this.emit('lut-changed', { lutName });
  }

  processFrame(videoElement) {
    if (!videoElement) return;

    this.ctx.drawImage(videoElement, 0, 0, this.canvas.width, this.canvas.height);
    const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);

    const correctedImageData = this.applyColorCorrection(imageData);
    this.ctx.putImageData(correctedImageData, 0, 0);

    // Update scopes if visible
    this.updateScopes(correctedImageData);
  }

  updateScopes(imageData) {
    // Update waveform, vectorscope, histogram, RGB parade
    // Implementation would depend on specific scope requirements
    this.emit('scopes-updated', { imageData });
  }

  setupEventListeners() {
    // Listen for parameter changes from UI
    window.addEventListener('color-correction-param', (event) => {
      this.setParameter(event.detail.param, event.detail.value);
    });

    window.addEventListener('color-correction-lut', (event) => {
      this.setLUT(event.detail.lutName);
    });
  }

  emit(event, data) {
    window.dispatchEvent(new CustomEvent(`color-correction-${event}`, { detail: data }));
  }

  exportSettings() {
    return {
      params: { ...this.params },
      currentLut: this.currentLut ? 'custom' : null
    };
  }

  importSettings(settings) {
    if (settings.params) {
      Object.assign(this.params, settings.params);
    }
    if (settings.currentLut) {
      this.setLUT(settings.currentLut);
    }
  }
}

// Export singleton instance
export const colorCorrectionEngine = new ColorCorrectionEngine(document.createElement('canvas'));

export default ColorCorrectionEngine;
