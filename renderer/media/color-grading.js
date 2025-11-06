'use strict';

(function registerColorGradingSystem(global) {
  // Advanced color grading system for Artone
  const COLOR_SPACES = {
    srgb: 'sRGB',
    rec709: 'Rec.709',
    rec2020: 'Rec.2020',
    p3: 'DCI-P3',
    acescg: 'ACEScg',
    aces2065: 'ACES2065-1'
  };

  const COLOR_GRADING_PRESETS = {
    // Film emulation presets
    'kodak-portra-400': {
      name: 'Kodak Portra 400',
      description: 'Warm, natural skin tones with soft contrast',
      category: 'film-emulation',
      parameters: {
        temperature: 6500,
        tint: 10,
        exposure: 0.1,
        contrast: 1.1,
        highlights: 0.05,
        shadows: 0.1,
        whites: 0.05,
        blacks: -0.05,
        saturation: 1.15,
        vibrance: 1.2,
        lift: [0.02, 0.01, -0.01],
        gamma: [1.05, 1.02, 0.98],
        gain: [1.1, 1.05, 0.95],
        offset: [0.05, 0.02, -0.02],
        slope: [1.1, 1.05, 0.95],
        power: [1.05, 1.02, 0.98]
      }
    },
    'fuji-400h': {
      name: 'Fuji 400H',
      description: 'Soft, pastel colors with creamy highlights',
      category: 'film-emulation',
      parameters: {
        temperature: 5800,
        tint: -5,
        exposure: 0.05,
        contrast: 1.05,
        highlights: 0.15,
        shadows: 0.05,
        whites: 0.1,
        blacks: -0.02,
        saturation: 1.25,
        vibrance: 1.1,
        lift: [0.01, 0.02, 0.03],
        gamma: [1.02, 1.01, 1.03],
        gain: [1.15, 1.1, 1.05],
        offset: [0.02, 0.01, -0.01],
        slope: [1.15, 1.1, 1.05],
        power: [1.02, 1.01, 1.03]
      }
    },
    'kodak-tri-x': {
      name: 'Kodak Tri-X',
      description: 'Classic black and white with rich contrast',
      category: 'film-emulation',
      parameters: {
        temperature: 5500,
        tint: 0,
        exposure: -0.1,
        contrast: 1.4,
        highlights: -0.1,
        shadows: 0.2,
        whites: -0.05,
        blacks: 0.05,
        saturation: 0,
        vibrance: 0,
        lift: [-0.02, -0.02, -0.02],
        gamma: [1.1, 1.1, 1.1],
        gain: [1.2, 1.2, 1.2],
        offset: [-0.1, -0.1, -0.1],
        slope: [1.2, 1.2, 1.2],
        power: [1.1, 1.1, 1.1]
      }
    },

    // HDR grading presets
    'hdr-dolby-vision-cinematic': {
      name: 'Dolby Vision Cinematic',
      description: 'Professional HDR grading with Dolby Vision color science',
      category: 'hdr-grading',
      parameters: {
        colorSpace: 'rec2020',
        transferFunction: 'pq',
        maxCLL: 1000,
        maxFALL: 400,
        temperature: 6500,
        tint: 0,
        exposure: 0.1,
        contrast: 1.2,
        highlights: 0.2,
        shadows: 0.1,
        whites: 0.1,
        blacks: -0.05,
        saturation: 1.1,
        vibrance: 1.05,
        hdrRollOff: 0.8,
        hdrLift: 0.1,
        hdrGain: 1.2,
        lift: [0.02, 0.01, 0.0],
        gamma: [1.1, 1.05, 1.0],
        gain: [1.2, 1.1, 0.9],
        offset: [0.05, 0.02, -0.02],
        slope: [1.2, 1.1, 0.9],
        power: [1.1, 1.05, 1.0]
      }
    },
    'hdr-netflix-standard': {
      name: 'Netflix HDR Standard',
      description: 'Netflix compliant HDR grading with accurate color reproduction',
      category: 'hdr-grading',
      parameters: {
        colorSpace: 'rec2020',
        transferFunction: 'pq',
        maxCLL: 1000,
        maxFALL: 300,
        temperature: 6500,
        tint: -2,
        exposure: 0,
        contrast: 1.15,
        highlights: 0.15,
        shadows: 0.05,
        whites: 0.05,
        blacks: 0,
        saturation: 1.08,
        vibrance: 1.02,
        hdrRollOff: 0.7,
        hdrLift: 0.05,
        hdrGain: 1.1,
        lift: [0.01, 0.01, 0.02],
        gamma: [1.05, 1.02, 0.98],
        gain: [1.15, 1.1, 1.0],
        offset: [0.02, 0.01, -0.01],
        slope: [1.15, 1.1, 1.0],
        power: [1.05, 1.02, 0.98]
      }
    },
    'hdr-amazon-prime': {
      name: 'Amazon Prime HDR',
      description: 'Amazon Prime Video compliant HDR grading',
      category: 'hdr-grading',
      parameters: {
        colorSpace: 'rec2020',
        transferFunction: 'pq',
        maxCLL: 1000,
        maxFALL: 300,
        temperature: 6200,
        tint: 5,
        exposure: 0.05,
        contrast: 1.1,
        highlights: 0.1,
        shadows: 0.08,
        whites: 0.08,
        blacks: -0.02,
        saturation: 1.05,
        vibrance: 1.08,
        hdrRollOff: 0.75,
        hdrLift: 0.08,
        hdrGain: 1.15,
        lift: [0.02, 0.03, 0.01],
        gamma: [1.02, 1.03, 1.01],
        gain: [1.1, 1.15, 1.05],
        offset: [0.03, 0.02, 0.0],
        slope: [1.1, 1.15, 1.05],
        power: [1.02, 1.03, 1.01]
      }
    },
    'hdr-arri-log-c': {
      name: 'ARRI Log C HDR',
      description: 'ARRI Log C to HDR conversion with accurate color mapping',
      category: 'hdr-grading',
      parameters: {
        colorSpace: 'aces2065',
        transferFunction: 'log-c',
        maxCLL: 1000,
        maxFALL: 400,
        temperature: 5600,
        tint: 0,
        exposure: 0,
        contrast: 1.25,
        highlights: 0.25,
        shadows: 0.15,
        whites: 0.1,
        blacks: 0,
        saturation: 1.0,
        vibrance: 1.0,
        hdrRollOff: 0.9,
        hdrLift: 0.2,
        hdrGain: 1.3,
        lift: [0.0, 0.0, 0.0],
        gamma: [1.15, 1.15, 1.15],
        gain: [1.3, 1.3, 1.3],
        offset: [0.0, 0.0, 0.0],
        slope: [1.3, 1.3, 1.3],
        power: [1.15, 1.15, 1.15]
      }
    },
        vibrance: 1.1,
        lift: [0.05, 0.02, -0.05],
        gamma: [1.1, 1.05, 0.95],
        gain: [1.2, 1.1, 0.9],
        offset: [0.1, 0.05, -0.1],
        slope: [1.2, 1.1, 0.9],
        power: [1.1, 1.05, 0.95]
      }
    },
    'cool-morning': {
      name: 'Cool Morning',
      description: 'Cool blue tones with crisp contrast',
      category: 'color-correction',
      parameters: {
        temperature: 4800,
        tint: -10,
        exposure: 0.1,
        contrast: 1.15,
        highlights: 0.05,
        shadows: 0.05,
        whites: 0.05,
        blacks: 0,
        saturation: 1.1,
        vibrance: 1.2,
        lift: [-0.02, 0.01, 0.05],
        gamma: [1.02, 1.05, 1.1],
        gain: [0.95, 1.05, 1.15],
        offset: [-0.05, 0.02, 0.1],
        slope: [0.95, 1.05, 1.15],
        power: [1.02, 1.05, 1.1]
      }
    },
    'vintage-retro': {
      name: 'Vintage Retro',
      description: 'Aged film look with muted colors',
      category: 'color-correction',
      parameters: {
        temperature: 5200,
        tint: 5,
        exposure: -0.05,
        contrast: 1.25,
        highlights: -0.05,
        shadows: 0.15,
        whites: -0.1,
        blacks: 0.1,
        saturation: 0.8,
        vibrance: 0.9,
        lift: [0.02, -0.01, -0.03],
        gamma: [1.15, 1.1, 1.05],
        gain: [0.9, 0.95, 1.0],
        offset: [0.05, -0.02, -0.05],
        slope: [0.9, 0.95, 1.0],
        power: [1.15, 1.1, 1.05]
      }
    },

    // Creative presets
    'cyberpunk-neon': {
      name: 'Cyberpunk Neon',
      description: 'High contrast with electric blue and pink',
      category: 'creative',
      parameters: {
        temperature: 9000,
        tint: 20,
        exposure: 0.15,
        contrast: 1.5,
        highlights: 0.4,
        shadows: -0.2,
        whites: 0.2,
        blacks: -0.1,
        saturation: 1.8,
        vibrance: 1.5,
        lift: [-0.1, 0.05, 0.2],
        gamma: [1.2, 1.1, 0.9],
        gain: [1.5, 1.2, 1.8],
        offset: [-0.2, 0.1, 0.4],
        slope: [1.5, 1.2, 1.8],
        power: [1.2, 1.1, 0.9]
      }
    },
    'horror-dark': {
      name: 'Horror Dark',
      description: 'Desaturated with cold blue shadows',
      category: 'creative',
      parameters: {
        temperature: 4000,
        tint: -15,
        exposure: -0.2,
        contrast: 1.6,
        highlights: -0.3,
        shadows: 0.3,
        whites: -0.15,
        blacks: 0.15,
        saturation: 0.6,
        vibrance: 0.7,
        lift: [-0.05, -0.02, 0.1],
        gamma: [1.3, 1.2, 0.9],
        gain: [0.7, 0.8, 1.2],
        offset: [-0.1, -0.05, 0.2],
        slope: [0.7, 0.8, 1.2],
        power: [1.3, 1.2, 0.9]
      }
    },
    'dreamy-soft': {
      name: 'Dreamy Soft',
      description: 'Soft focus with pastel colors',
      category: 'creative',
      parameters: {
        temperature: 6200,
        tint: 8,
        exposure: 0.05,
        contrast: 0.85,
        highlights: 0.2,
        shadows: 0.1,
        whites: 0.05,
        blacks: 0.02,
        saturation: 1.4,
        vibrance: 1.3,
        lift: [0.03, 0.02, 0.04],
        gamma: [0.95, 0.98, 1.02],
        gain: [1.2, 1.15, 1.1],
        offset: [0.06, 0.04, 0.08],
        slope: [1.2, 1.15, 1.1],
        power: [0.95, 0.98, 1.02]
      }
    },

    // Black and white presets
    'modern-bw': {
      name: 'Modern B&W',
      description: 'Clean black and white with good contrast',
      category: 'black-white',
      parameters: {
        temperature: 5500,
        tint: 0,
        exposure: 0,
        contrast: 1.3,
        highlights: 0,
        shadows: 0.1,
        whites: 0,
        blacks: 0,
        saturation: 0,
        vibrance: 0,
        lift: [0, 0, 0],
        gamma: [1.2, 1.2, 1.2],
        gain: [1.1, 1.1, 1.1],
        offset: [0, 0, 0],
        slope: [1.1, 1.1, 1.1],
        power: [1.2, 1.2, 1.2]
      }
    },
    'high-contrast-bw': {
      name: 'High Contrast B&W',
      description: 'Dramatic black and white with strong contrast',
      category: 'black-white',
      parameters: {
        temperature: 5500,
        tint: 0,
        exposure: -0.1,
        contrast: 1.8,
        highlights: -0.2,
        shadows: 0.3,
        whites: -0.1,
        blacks: 0.2,
        saturation: 0,
        vibrance: 0,
        lift: [-0.02, -0.02, -0.02],
        gamma: [1.4, 1.4, 1.4],
        gain: [1.3, 1.3, 1.3],
        offset: [-0.05, -0.05, -0.05],
        slope: [1.3, 1.3, 1.3],
        power: [1.4, 1.4, 1.4]
      }
    },

    // Log and HDR presets
    'log-c-corrected': {
      name: 'Log C Corrected',
      description: 'Proper color correction for Log C footage',
      category: 'log-hdr',
      parameters: {
        temperature: 5600,
        tint: 0,
        exposure: 0.5,
        contrast: 1.2,
        highlights: 0.1,
        shadows: 0.05,
        whites: 0.15,
        blacks: -0.05,
        saturation: 1.1,
        vibrance: 1.05,
        lift: [0.1, 0.08, 0.06],
        gamma: [1.8, 1.8, 1.8],
        gain: [1.2, 1.15, 1.1],
        offset: [0.2, 0.18, 0.15],
        slope: [1.2, 1.15, 1.1],
        power: [1.8, 1.8, 1.8]
      }
    },
    'slog3-sgamut3-cine': {
      name: 'S-Log3 S-Gamut3 Cine',
      description: 'Sony S-Log3 to cinematic color space',
      category: 'log-hdr',
      parameters: {
        temperature: 5600,
        tint: 0,
        exposure: 0.6,
        contrast: 1.15,
        highlights: 0.05,
        shadows: 0.08,
        whites: 0.1,
        blacks: -0.02,
        saturation: 1.05,
        vibrance: 1.02,
        lift: [0.12, 0.1, 0.08],
        gamma: [2.0, 2.0, 2.0],
        gain: [1.15, 1.1, 1.05],
        offset: [0.25, 0.22, 0.18],
        slope: [1.15, 1.1, 1.05],
        power: [2.0, 2.0, 2.0]
      }
    }
  };

  class ColorGradingManager {
    constructor() {
      this.currentGrade = {};
      this.presets = new Map();
      this.customPresets = new Map();
      this.colorSpace = 'rec709';
      this.workingSpace = 'acescg';
      this.onGradeChange = null;
      this.history = [];
      this.historyIndex = -1;
      this.maxHistorySize = 50;

      // HDR specific properties
      this.hdrEnabled = false;
      this.maxCLL = 1000; // Maximum Content Light Level (nits)
      this.maxFALL = 400; // Maximum Frame Average Light Level (nits)
      this.transferFunction = 'srgb'; // 'srgb', 'pq', 'hlg', 'log-c'
      this.colorimetry = 'rec709'; // 'rec709', 'rec2020', 'p3'

      this.initializePresets();
    }

    initializePresets() {
      for (const [key, preset] of Object.entries(COLOR_GRADING_PRESETS)) {
        this.presets.set(key, {
          ...preset,
          id: key,
          created: Date.now(),
          modified: Date.now(),
          usageCount: 0
        });
      }
    }

    // Apply a color grading preset
    applyPreset(presetId, blendFactor = 1.0) {
      const preset = this.presets.get(presetId) || this.customPresets.get(presetId);
      if (!preset) {
        throw new Error(`Preset not found: ${presetId}`);
      }

      const previousGrade = { ...this.currentGrade };

      if (blendFactor >= 1.0) {
        this.currentGrade = { ...preset.parameters };
      } else {
        this.currentGrade = this.blendGrades(this.currentGrade, preset.parameters, blendFactor);
      }

      this.addToHistory(previousGrade);
      this.emitGradeChange();
      preset.usageCount = (preset.usageCount || 0) + 1;
      preset.lastUsed = Date.now();

      return {
        previous: previousGrade,
        current: this.currentGrade,
        preset: preset.name
      };
    }

    // Blend two color grades
    blendGrades(grade1, grade2, factor) {
      const blended = {};

      for (const key in { ...grade1, ...grade2 }) {
        const value1 = grade1[key];
        const value2 = grade2[key];

        if (typeof value1 === 'number' && typeof value2 === 'number') {
          blended[key] = value1 + (value2 - value1) * factor;
        } else if (Array.isArray(value1) && Array.isArray(value2)) {
          blended[key] = value1.map((v, i) => {
            const v2 = value2[i];
            if (typeof v === 'number' && typeof v2 === 'number') {
              return v + (v2 - v) * factor;
            }
            return v;
          });
        } else {
          blended[key] = factor > 0.5 ? value2 : value1;
        }
      }

      return blended;
    }

    // Create a custom preset
    createPreset(name, parameters, category = 'custom') {
      const presetId = `custom_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const preset = {
        id: presetId,
        name,
        description: `Custom ${category} preset`,
        category,
        parameters: { ...parameters },
        created: Date.now(),
        modified: Date.now(),
        usageCount: 0,
        isCustom: true
      };

      this.customPresets.set(presetId, preset);
      return presetId;
    }

    // Update a custom preset
    updatePreset(presetId, updates) {
      const preset = this.customPresets.get(presetId);
      if (!preset) {
        throw new Error(`Custom preset not found: ${presetId}`);
      }

      if (updates.parameters) {
        preset.parameters = { ...preset.parameters, ...updates.parameters };
      }

      preset.name = updates.name || preset.name;
      preset.description = updates.description || preset.description;
      preset.category = updates.category || preset.category;
      preset.modified = Date.now();

      return preset;
    }

    // Delete a custom preset
    deletePreset(presetId) {
      if (!this.customPresets.has(presetId)) {
        throw new Error(`Custom preset not found: ${presetId}`);
      }

      this.customPresets.delete(presetId);
      return true;
    }

    // Get all presets
    getAllPresets() {
      const presets = [];

      for (const [id, preset] of this.presets) {
        presets.push({ ...preset, id });
      }

      for (const [id, preset] of this.customPresets) {
        presets.push({ ...preset, id });
      }

      return presets.sort((a, b) => {
        if (a.category !== b.category) {
          return a.category.localeCompare(b.category);
        }
        return a.name.localeCompare(b.name);
      });
    }

    // Get presets by category
    getPresetsByCategory(category) {
      const presets = this.getAllPresets();
      return presets.filter(preset => preset.category === category);
    }

    // Get current color grade
    getCurrentGrade() {
      return { ...this.currentGrade };
    }

    // Set individual parameter
    setParameter(parameter, value) {
      const previousValue = this.currentGrade[parameter];
      this.currentGrade[parameter] = value;
      this.emitGradeChange();
      return previousValue;
    }

    // Get individual parameter
    getParameter(parameter, defaultValue = 0) {
      return this.currentGrade[parameter] !== undefined ? this.currentGrade[parameter] : defaultValue;
    }

    // Reset to default grade
    reset() {
      const previousGrade = { ...this.currentGrade };
      this.currentGrade = {
        temperature: 5600,
        tint: 0,
        exposure: 0,
        contrast: 1,
        highlights: 0,
        shadows: 0,
        whites: 0,
        blacks: 0,
        saturation: 1,
        vibrance: 1,
        lift: [0, 0, 0],
        gamma: [1, 1, 1],
        gain: [1, 1, 1],
        offset: [0, 0, 0],
        slope: [1, 1, 1],
        power: [1, 1, 1]
      };
      this.addToHistory(previousGrade);
      this.emitGradeChange();
      return previousGrade;
    }

    // Add current state to history
    addToHistory(previousGrade) {
      if (this.historyIndex < this.history.length - 1) {
        this.history = this.history.slice(0, this.historyIndex + 1);
      }

      this.history.push(previousGrade);
      this.historyIndex++;

      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
        this.historyIndex--;
      }
    }

    // Undo last change
    undo() {
      if (this.historyIndex > 0) {
        const previousGrade = this.history[this.historyIndex - 1];
        this.currentGrade = { ...previousGrade };
        this.historyIndex--;
        this.emitGradeChange();
        return true;
      }
      return false;
    }

    // Redo last undone change
    redo() {
      if (this.historyIndex < this.history.length - 1) {
        this.historyIndex++;
        this.currentGrade = { ...this.history[this.historyIndex] };
        this.emitGradeChange();
        return true;
      }
      return false;
    }

    // Export current grade
    exportGrade(format = 'json') {
      const grade = {
        ...this.currentGrade,
        colorSpace: this.colorSpace,
        workingSpace: this.workingSpace,
        // Include HDR metadata
        hdrEnabled: this.hdrEnabled,
        maxCLL: this.maxCLL,
        maxFALL: this.maxFALL,
        transferFunction: this.transferFunction,
        colorimetry: this.colorimetry,
        exportedAt: Date.now()
      };

      switch (format) {
        case 'json':
          return JSON.stringify(grade, null, 2);
        case 'cube':
          return this.exportToCube(grade);
        case '3dl':
          return this.exportTo3DL(grade);
        default:
          throw new Error(`Unsupported export format: ${format}`);
      }
    }

    // Import color grade
    importGrade(data, format = 'json') {
      let grade;

      switch (format) {
        case 'json':
          grade = JSON.parse(data);
          break;
        case 'cube':
          grade = this.parseCube(data);
          break;
        case '3dl':
          grade = this.parse3DL(data);
          break;
        default:
          throw new Error(`Unsupported import format: ${format}`);
      }

      if (grade.colorSpace) this.colorSpace = grade.colorSpace;
      if (grade.workingSpace) this.workingSpace = grade.workingSpace;

      // Import HDR metadata
      if (grade.hdrEnabled !== undefined) this.hdrEnabled = grade.hdrEnabled;
      if (grade.maxCLL !== undefined) this.maxCLL = grade.maxCLL;
      if (grade.maxFALL !== undefined) this.maxFALL = grade.maxFALL;
      if (grade.transferFunction) this.transferFunction = grade.transferFunction;
      if (grade.colorimetry) this.colorimetry = grade.colorimetry;

      const previousGrade = { ...this.currentGrade };
      this.currentGrade = { ...grade };
      delete this.currentGrade.colorSpace;
      delete this.currentGrade.workingSpace;
      delete this.currentGrade.exportedAt;
      delete this.currentGrade.hdrEnabled;
      delete this.currentGrade.maxCLL;
      delete this.currentGrade.maxFALL;
      delete this.currentGrade.transferFunction;
      delete this.currentGrade.colorimetry;

      this.addToHistory(previousGrade);
      this.emitGradeChange();
    }

    // Export to .cube format (DaVinci Resolve)
    exportToCube(grade) {
      let cube = `# Artone Color Grade Export
# Exported: ${new Date(grade.exportedAt).toISOString()}
#
# Domain Min: 0.0 0.0 0.0
# Domain Max: 1.0 1.0 1.0
#
LUT_3D_SIZE 33
LUT_3D_INPUT_RANGE 0.0 1.0
`;

      // Generate 3D LUT data
      for (let b = 0; b < 33; b++) {
        for (let g = 0; g < 33; g++) {
          for (let r = 0; r < 33; r++) {
            const input = [
              r / 32.0,
              g / 32.0,
              b / 32.0
            ];

            const output = this.applyColorGrade(input, grade);
            cube += `${output[0].toFixed(6)} ${output[1].toFixed(6)} ${output[2].toFixed(6)}\n`;
          }
        }
      }

      return cube;
    }

    // Export to .3dl format (Flame/Lustre)
    exportTo3DL(grade) {
      let lut3d = `<?xml version="1.0" encoding="UTF-8"?>
<ColorCorrectionCollection xmlns="urn:ASC:CDL:v1.2">
  <ColorCorrection id="Artone_Export">
    <SOPNode>
      <Slope>${grade.slope ? grade.slope.join(' ') : '1.0 1.0 1.0'}</Slope>
      <Offset>${grade.offset ? grade.offset.join(' ') : '0.0 0.0 0.0'}</Offset>
      <Power>${grade.power ? grade.power.join(' ') : '1.0 1.0 1.0'}</Power>
    </SOPNode>
    <SatNode>
      <Saturation>${grade.saturation || 1.0}</Saturation>
    </SatNode>
  </ColorCorrection>
</ColorCorrectionCollection>`;
      return lut3d;
    }

    // Parse .cube format
    parseCube(cubeData) {
      // Simplified cube parser - would need full implementation
      const lines = cubeData.split('\n');
      const grade = {};

      for (const line of lines) {
        if (line.startsWith('#')) continue;
        if (line.includes('Temperature')) {
          grade.temperature = parseFloat(line.split(':')[1]);
        }
        if (line.includes('Contrast')) {
          grade.contrast = parseFloat(line.split(':')[1]);
        }
        if (line.includes('Saturation')) {
          grade.saturation = parseFloat(line.split(':')[1]);
        }
      }

      return grade;
    }

    // Parse .3dl format
    parse3DL(lut3dData) {
      // Simplified 3DL parser - would need full implementation
      const grade = {};

      if (lut3dData.includes('<Slope>')) {
        const slopeMatch = lut3dData.match(/<Slope>(.*?)<\/Slope>/);
        if (slopeMatch) {
          grade.slope = slopeMatch[1].split(' ').map(parseFloat);
        }
      }

      if (lut3dData.includes('<Offset>')) {
        const offsetMatch = lut3dData.match(/<Offset>(.*?)<\/Offset>/);
        if (offsetMatch) {
          grade.offset = offsetMatch[1].split(' ').map(parseFloat);
        }
      }

      if (lut3dData.includes('<Power>')) {
        const powerMatch = lut3dData.match(/<Power>(.*?)<\/Power>/);
        if (powerMatch) {
          grade.power = powerMatch[1].split(' ').map(parseFloat);
        }
      }

      return grade;
    }

    // Apply color grade to RGB values
    applyColorGrade(rgb, grade = null) {
      const currentGrade = grade || this.currentGrade;

      if (!currentGrade) return rgb;

      let [r, g, b] = rgb;

      // Apply basic color correction
      if (currentGrade.temperature || currentGrade.tint) {
        [r, g, b] = this.applyTemperatureTint([r, g, b], currentGrade.temperature, currentGrade.tint);
      }

      // Apply exposure
      if (currentGrade.exposure) {
        const exposure = Math.pow(2, currentGrade.exposure);
        r *= exposure;
        g *= exposure;
        b *= exposure;
      }

      // Apply contrast
      if (currentGrade.contrast !== 1) {
        [r, g, b] = this.applyContrast([r, g, b], currentGrade.contrast);
      }

      // Apply highlights/shadows
      if (currentGrade.highlights || currentGrade.shadows) {
        [r, g, b] = this.applyHighlightsShadows([r, g, b], currentGrade.highlights, currentGrade.shadows);
      }

      // Apply whites/blacks
      if (currentGrade.whites || currentGrade.blacks) {
        [r, g, b] = this.applyWhitesBlacks([r, g, b], currentGrade.whites, currentGrade.blacks);
      }

      // Apply saturation/vibrance
      if (currentGrade.saturation !== 1 || currentGrade.vibrance !== 1) {
        [r, g, b] = this.applySaturationVibrance([r, g, b], currentGrade.saturation, currentGrade.vibrance);
      }

      // Apply ASC-CDL corrections
      if (currentGrade.slope || currentGrade.offset || currentGrade.power) {
        [r, g, b] = this.applyASCCDL([r, g, b], currentGrade);
      }

      // Clamp values
      r = Math.max(0, Math.min(1, r));
      g = Math.max(0, Math.min(1, g));
      b = Math.max(0, Math.min(1, b));

      return [r, g, b];
    }

    applyTemperatureTint(rgb, temperature, tint) {
      // Simplified temperature/tint adjustment
      const tempFactor = (temperature - 5600) / 5600;
      const tintFactor = tint / 100;

      return [
        rgb[0] * (1 + tempFactor * 0.3 + tintFactor * 0.1),
        rgb[1] * (1 + tempFactor * 0.1 + tintFactor * 0.2),
        rgb[2] * (1 + tempFactor * 0.1 - tintFactor * 0.3)
      ];
    }

    applyContrast(rgb, contrast) {
      const factor = (contrast - 1) * 0.5;
      return rgb.map(v => v + (v - 0.5) * factor);
    }

    applyHighlightsShadows(rgb, highlights, shadows) {
      return rgb.map((v, i) => {
        if (v > 0.5) {
          return v + highlights * (v - 0.5) * 2;
        } else {
          return v + shadows * v * 2;
        }
      });
    }

    applyWhitesBlacks(rgb, whites, blacks) {
      return rgb.map(v => {
        v = Math.max(0, Math.min(1, v + blacks));
        v = Math.max(0, Math.min(1, v + whites * (1 - v)));
        return v;
      });
    }

    applySaturationVibrance(rgb, saturation, vibrance) {
      const max = Math.max(...rgb);
      const min = Math.min(...rgb);
      const delta = max - min;

      if (delta === 0) return rgb;

      const luma = (max + min) / 2;
      const sat = saturation - 1;

      return rgb.map((v, i) => {
        const newV = v + sat * (v - luma);
        return newV;
      });
    }

    applyASCCDL(rgb, grade) {
      let [r, g, b] = rgb;

      // Apply slope (multiply)
      if (grade.slope) {
        r *= grade.slope[0] || 1;
        g *= grade.slope[1] || 1;
        b *= grade.slope[2] || 1;
      }

      // Apply offset (add)
      if (grade.offset) {
        r += grade.offset[0] || 0;
        g += grade.offset[1] || 0;
        b += grade.offset[2] || 0;
      }

      // Apply power (gamma)
      if (grade.power) {
        r = Math.pow(Math.max(0, r), 1 / (grade.power[0] || 1));
        g = Math.pow(Math.max(0, g), 1 / (grade.power[1] || 1));
        b = Math.pow(Math.max(0, b), 1 / (grade.power[2] || 1));
      }

      return [r, g, b];
    }

    // Event system
    onGradeChange(callback) {
      this.onGradeChange = callback;
    }

    emitGradeChange() {
      if (this.onGradeChange) {
        this.onGradeChange(this.currentGrade);
      }
    }

    // Set color space
    setColorSpace(colorSpace) {
      if (!COLOR_SPACES[colorSpace]) {
        throw new Error(`Invalid color space: ${colorSpace}`);
      }
      this.colorSpace = colorSpace;
    }

    // Set working space
    setWorkingSpace(workingSpace) {
      if (!COLOR_SPACES[workingSpace]) {
        throw new Error(`Invalid working space: ${workingSpace}`);
      }
      this.workingSpace = workingSpace;
    }

    // Get color space info
    getColorSpaceInfo() {
      return {
        current: this.colorSpace,
        working: this.workingSpace,
        available: Object.keys(COLOR_SPACES)
      };
    }

    // HDR specific methods
    enableHDR(enabled = true) {
      this.hdrEnabled = enabled;
      this.emitGradeChange();
    }

    isHDREnabled() {
      return this.hdrEnabled;
    }

    setHDRMetadata(metadata) {
      if (metadata.maxCLL !== undefined) this.maxCLL = metadata.maxCLL;
      if (metadata.maxFALL !== undefined) this.maxFALL = metadata.maxFALL;
      if (metadata.transferFunction) this.transferFunction = metadata.transferFunction;
      if (metadata.colorimetry) this.colorimetry = metadata.colorimetry;
      this.emitGradeChange();
    }

    getHDRMetadata() {
      return {
        enabled: this.hdrEnabled,
        maxCLL: this.maxCLL,
        maxFALL: this.maxFALL,
        transferFunction: this.transferFunction,
        colorimetry: this.colorimetry
      };
    }

    // Apply HDR tone mapping
    applyHDRToneMapping(rgb) {
      if (!this.hdrEnabled) return rgb;

      let [r, g, b] = rgb;

      // Apply transfer function conversion
      switch (this.transferFunction) {
        case 'pq':
          [r, g, b] = this.linearToPQ([r, g, b]);
          break;
        case 'hlg':
          [r, g, b] = this.linearToHLG([r, g, b]);
          break;
        case 'log-c':
          [r, g, b] = this.linearToLogC([r, g, b]);
          break;
        default:
          // sRGB transfer function (no change needed for linear input)
          break;
      }

      return [r, g, b];
    }

    // PQ (Perceptual Quantizer) encoding
    linearToPQ(linearRGB) {
      const m1 = 0.1593017578125;
      const m2 = 78.84375;
      const c1 = 0.8359375;
      const c2 = 18.8515625;
      const c3 = 18.6875;

      return linearRGB.map(linear => {
        const linearNorm = linear / 10000.0; // Normalize to 10000 nits
        const num = Math.pow(c1 + c2 * Math.pow(linearNorm, m1), m2);
        const den = 1 + c3 * Math.pow(linearNorm, m1);
        return num / den;
      });
    }

    // HLG (Hybrid Log-Gamma) encoding
    linearToHLG(linearRGB) {
      const a = 0.17883277;
      const b = 0.28466892;
      const c = 0.55991073;

      return linearRGB.map(linear => {
        const normalized = linear / 1000.0; // Normalize to 1000 nits
        if (normalized <= 1/12) {
          return Math.sqrt(3 * normalized);
        } else {
          return a * Math.log(12 * normalized - b) + c;
        }
      });
    }

    // ARRI Log C encoding (simplified)
    linearToLogC(linearRGB) {
      return linearRGB.map(linear => {
        const normalized = linear / 0.9; // Normalize
        if (normalized < 0.01081081) {
          return (normalized * 5.301883) + 0.0928;
        } else {
          return Math.log(normalized * 0.9892 + 0.0108) * 0.2472 + 0.3913;
        }
      });
    }

    // Convert between color spaces
    convertColorSpace(rgb, fromSpace, toSpace) {
      // Simplified color space conversion
      // In a real implementation, this would use proper color science matrices

      if (fromSpace === toSpace) return rgb;

      // For now, return the input unchanged
      // Full implementation would require color science matrices
      console.log(`Color space conversion from ${fromSpace} to ${toSpace} not fully implemented`);
      return rgb;
    }

    // Cleanup
    destroy() {
      this.history = [];
      this.historyIndex = -1;
    }
  }

  class ColorGradingUI {
    constructor(container, colorGradingManager) {
      this.container = container;
      this.manager = colorGradingManager;
      this.currentCategory = 'all';
      this.selectedPreset = null;
      this.isDragging = false;
      this.dragSlider = null;

      this.setupUI();
      this.setupEventListeners();
      this.updatePresetList();
    }

    setupUI() {
      const root = document.createElement('div');
      root.className = 'color-grading-ui';

      const toolbar = document.createElement('div');
      toolbar.className = 'grading-toolbar';

      const categories = document.createElement('div');
      categories.className = 'preset-categories';

      const categoryConfig = [
        { label: 'All', value: 'all', active: true },
        { label: 'Film', value: 'film-emulation' },
        { label: 'Color', value: 'color-correction' },
        { label: 'Creative', value: 'creative' },
        { label: 'B&W', value: 'black-white' },
        { label: 'Log/HDR', value: 'log-hdr' },
        { label: 'Custom', value: 'custom' }
      ];

      categoryConfig.forEach(({ label, value, active }) => {
        const button = document.createElement('button');
        button.className = `category-btn${active ? ' active' : ''}`;
        button.dataset.category = value;
        button.textContent = label;
        categories.appendChild(button);
      });

      const actions = document.createElement('div');
      actions.className = 'toolbar-actions';

      const toolbarButtons = [
        { id: 'reset-grade', title: 'Reset Color Grade', text: 'Reset' },
        { id: 'undo-grade', title: 'Undo', text: 'Undo' },
        { id: 'redo-grade', title: 'Redo', text: 'Redo' },
        { id: 'export-grade', title: 'Export Grade', text: 'Export' },
        { id: 'import-grade', title: 'Import Grade', text: 'Import' }
      ];

      toolbarButtons.forEach(({ id, title, text }) => {
        const button = document.createElement('button');
        button.id = id;
        button.title = title;
        button.textContent = text;
        actions.appendChild(button);
      });

      toolbar.appendChild(categories);
      toolbar.appendChild(actions);

      const presetGrid = document.createElement('div');
      presetGrid.className = 'preset-grid';
      const presetList = document.createElement('div');
      presetList.className = 'preset-list';
      presetGrid.appendChild(presetList);

      const gradeControls = document.createElement('div');
      gradeControls.className = 'grade-controls';

      const sliders = [
        { id: 'temperature', label: 'Temperature', min: 2000, max: 10000, step: 50, value: 5600, display: '5600K' },
        { id: 'tint', label: 'Tint', min: -50, max: 50, step: 1, value: 0, display: '0' },
        { id: 'exposure', label: 'Exposure', min: -2, max: 2, step: 0.1, value: 0, display: '0.0' },
        { id: 'contrast', label: 'Contrast', min: 0.5, max: 2, step: 0.05, value: 1, display: '1.00' },
        { id: 'highlights', label: 'Highlights', min: -1, max: 1, step: 0.05, value: 0, display: '0.00' },
        { id: 'shadows', label: 'Shadows', min: -1, max: 1, step: 0.05, value: 0, display: '0.00' },
        { id: 'saturation', label: 'Saturation', min: 0, max: 2, step: 0.05, value: 1, display: '1.00' },
        { id: 'vibrance', label: 'Vibrance', min: 0, max: 2, step: 0.05, value: 1, display: '1.00' }
      ];

      sliders.forEach(({ id, label, min, max, step, value, display }) => {
        const group = document.createElement('div');
        group.className = 'control-group';

        const labelEl = document.createElement('label');
        labelEl.textContent = label;

        const input = document.createElement('input');
        input.type = 'range';
        input.id = id;
        input.min = String(min);
        input.max = String(max);
        input.step = String(step);
        input.value = String(value);

        const displayEl = document.createElement('span');
        displayEl.className = 'value-display';
        displayEl.id = `${id}-value`;
        displayEl.textContent = display;

        group.appendChild(labelEl);
        group.appendChild(input);
        group.appendChild(displayEl);
        gradeControls.appendChild(group);
      });

      const colorWheels = document.createElement('div');
      colorWheels.className = 'color-wheels';

      ['lift', 'gamma', 'gain'].forEach(wheelId => {
        const wheelGroup = document.createElement('div');
        wheelGroup.className = 'wheel-group';

        const label = document.createElement('label');
        label.textContent = wheelId.charAt(0).toUpperCase() + wheelId.slice(1);

        const wheel = document.createElement('div');
        wheel.className = 'color-wheel';
        wheel.id = `${wheelId}-wheel`;

        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 200;
        wheel.appendChild(canvas);

        wheelGroup.appendChild(label);
        wheelGroup.appendChild(wheel);
        colorWheels.appendChild(wheelGroup);
      });

      root.appendChild(toolbar);
      root.appendChild(presetGrid);
      root.appendChild(gradeControls);
      root.appendChild(colorWheels);

      this.container.textContent = '';
      this.container.appendChild(root);

      this.presetList = presetList;
      this.setupColorWheels();
    }

    setupEventListeners() {
      // Category buttons
      this.container.querySelectorAll('.category-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          this.setCategory(e.target.dataset.category);
        });
      });

      // Control sliders
      this.container.querySelectorAll('input[type="range"]').forEach(slider => {
        slider.addEventListener('input', (e) => {
          this.updateParameter(e.target.id, parseFloat(e.target.value));
          this.updateValueDisplay(e.target.id, e.target.value);
        });

        slider.addEventListener('change', (e) => {
          this.updateParameter(e.target.id, parseFloat(e.target.value));
        });
      });

      // Toolbar actions
      this.container.querySelector('#reset-grade').addEventListener('click', () => {
        this.manager.reset();
      });

      this.container.querySelector('#undo-grade').addEventListener('click', () => {
        this.manager.undo();
      });

      this.container.querySelector('#redo-grade').addEventListener('click', () => {
        this.manager.redo();
      });

      this.container.querySelector('#export-grade').addEventListener('click', () => {
        this.exportGrade();
      });

      this.container.querySelector('#import-grade').addEventListener('click', () => {
        this.importGrade();
      });
    }

    setupColorWheels() {
      const wheels = ['lift', 'gamma', 'gain'];

      wheels.forEach(wheelId => {
        const canvas = this.container.querySelector(`#${wheelId}-wheel canvas`);
        const ctx = canvas.getContext('2d');

        this.drawColorWheel(ctx, canvas.width, canvas.height);

        canvas.addEventListener('mousedown', (e) => {
          this.startColorWheelDrag(e, wheelId);
        });

        canvas.addEventListener('mousemove', (e) => {
          this.updateColorWheelDrag(e, wheelId);
        });

        canvas.addEventListener('mouseup', () => {
          this.endColorWheelDrag();
        });
      });
    }

    drawColorWheel(ctx, width, height) {
      const centerX = width / 2;
      const centerY = height / 2;
      const radius = Math.min(width, height) / 2 - 10;

      // Draw color wheel
      for (let angle = 0; angle < 360; angle++) {
        for (let r = 0; r < radius; r++) {
          const x = centerX + r * Math.cos(angle * Math.PI / 180);
          const y = centerY + r * Math.sin(angle * Math.PI / 180);

          const hue = angle;
          const saturation = r / radius;
          const lightness = 0.5;

          ctx.fillStyle = `hsl(${hue}, ${saturation * 100}%, ${lightness * 100}%)`;
          ctx.fillRect(x, y, 1, 1);
        }
      }

      // Draw center circle
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, 5, 0, 2 * Math.PI);
      ctx.stroke();
    }

    setCategory(category) {
      this.currentCategory = category;
      this.container.querySelectorAll('.category-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.category === category);
      });
      this.updatePresetList();
    }

    updatePresetList() {
      const presets = this.currentCategory === 'all'
        ? this.manager.getAllPresets()
        : this.manager.getPresetsByCategory(this.currentCategory);

      this.presetList.textContent = '';

      presets.forEach(preset => {
        const item = document.createElement('div');
        item.className = 'preset-item';
        item.dataset.presetId = preset.id;

        const info = document.createElement('div');
        info.className = 'preset-info';

        const name = document.createElement('div');
        name.className = 'preset-name';
        name.textContent = preset.name;

        const description = document.createElement('div');
        description.className = 'preset-description';
        description.textContent = preset.description;

        const category = document.createElement('div');
        category.className = 'preset-category';
        category.textContent = preset.category;

        info.appendChild(name);
        info.appendChild(description);
        info.appendChild(category);

        const applyButton = document.createElement('button');
        applyButton.className = 'apply-preset-btn';
        applyButton.dataset.presetId = preset.id;
        applyButton.textContent = 'Apply';
        applyButton.addEventListener('click', () => {
          this.applyPreset(preset.id);
        });

        item.appendChild(info);
        item.appendChild(applyButton);
        this.presetList.appendChild(item);
      });
    }

    applyPreset(presetId) {
      try {
        this.manager.applyPreset(presetId);
        this.updateControls();
      } catch (error) {
        console.error('Failed to apply preset:', error);
      }
    }

    updateParameter(parameter, value) {
      this.manager.setParameter(parameter, value);
    }

    updateValueDisplay(parameter, value) {
      const display = this.container.querySelector(`#${parameter}-value`);
      if (display) {
        if (parameter === 'temperature') {
          display.textContent = `${Math.round(value)}K`;
        } else {
          display.textContent = parseFloat(value).toFixed(2);
        }
      }
    }

    updateControls() {
      const grade = this.manager.getCurrentGrade();

      Object.entries(grade).forEach(([parameter, value]) => {
        const slider = this.container.querySelector(`#${parameter}`);
        const display = this.container.querySelector(`#${parameter}-value`);

        if (slider) {
          slider.value = value;
        }

        if (display) {
          this.updateValueDisplay(parameter, value);
        }
      });
    }

    startColorWheelDrag(e, wheelId) {
      this.isDragging = true;
      this.dragWheel = wheelId;
      this.updateColorWheelDrag(e, wheelId);
    }

    updateColorWheelDrag(e, wheelId) {
      if (!this.isDragging || this.dragWheel !== wheelId) return;

      const canvas = this.container.querySelector(`#${wheelId}-wheel canvas`);
      const rect = canvas.getBoundingClientRect();
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      const radius = Math.min(canvas.width, canvas.height) / 2 - 10;

      const x = e.clientX - rect.left - centerX;
      const y = e.clientY - rect.top - centerY;

      const distance = Math.sqrt(x * x + y * y);
      const angle = Math.atan2(y, x) * 180 / Math.PI;

      if (distance <= radius) {
        const normalizedX = x / radius;
        const normalizedY = y / radius;

        // Update the appropriate parameter
        const currentGrade = this.manager.getCurrentGrade();
        const currentValue = currentGrade[wheelId] || [0, 0, 0];

        currentValue[0] = normalizedX; // Red
        currentValue[1] = -normalizedY; // Green
        currentValue[2] = 0; // Blue (would be calculated from distance)

        this.manager.setParameter(wheelId, currentValue);
      }
    }

    endColorWheelDrag() {
      this.isDragging = false;
      this.dragWheel = null;
    }

    exportGrade() {
      const grade = this.manager.exportGrade('json');
      const blob = new Blob([grade], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `color_grade_${Date.now()}.json`;
      a.click();

      URL.revokeObjectURL(url);
    }

    importGrade() {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.cube,.3dl';

      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            try {
              const format = file.name.endsWith('.cube') ? 'cube' :
                           file.name.endsWith('.3dl') ? '3dl' : 'json';
              this.manager.importGrade(e.target.result, format);
              this.updateControls();
            } catch (error) {
              console.error('Failed to import grade:', error);
            }
          };
          reader.readAsText(file);
        }
      };

      input.click();
    }

    // Public API
    setPresetCategory(category) {
      this.setCategory(category);
    }

    refresh() {
      this.updatePresetList();
      this.updateControls();
    }
  }

  // Export to global scope
  global.ColorGradingManager = ColorGradingManager;
  global.ColorGradingUI = ColorGradingUI;
  global.COLOR_GRADING_PRESETS = COLOR_GRADING_PRESETS;
  global.COLOR_SPACES = COLOR_SPACES;

})(typeof window !== 'undefined' ? window : globalThis);
