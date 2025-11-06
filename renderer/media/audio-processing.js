/**
 * Advanced Audio Processing System
 * Comprehensive audio enhancement with noise reduction, voice isolation, and intelligent mixing
 */

(function initializeAudioProcessing(global) {
  'use strict';

  // Audio Processing Types
  const AUDIO_PROCESSING_TYPES = {
    NOISE_REDUCTION: 'noise_reduction',
    VOICE_ISOLATION: 'voice_isolation',
    REVERB_REMOVAL: 'reverb_removal',
    ECHO_CANCELLATION: 'echo_cancellation',
    PITCH_CORRECTION: 'pitch_correction',
    VOLUME_NORMALIZATION: 'volume_normalization',
    STEREO_ENHANCEMENT: 'stereo_enhancement',
    EQUALIZATION: 'equalization',
    COMPRESSION: 'compression',
    LIMITING: 'limiting'
  };

  // Audio Analysis Types
  const AUDIO_ANALYSIS_TYPES = {
    FREQUENCY_SPECTRUM: 'frequency_spectrum',
    WAVEFORM: 'waveform',
    PEAK_LEVELS: 'peak_levels',
    RMS_LEVELS: 'rms_levels',
    SILENCE_DETECTION: 'silence_detection',
    BEAT_DETECTION: 'beat_detection',
    PITCH_DETECTION: 'pitch_detection',
    SPEECH_RECOGNITION: 'speech_recognition'
  };

  // Audio Processing Chain
  class AudioProcessingChain {
    constructor(audioContext) {
      this.audioContext = audioContext;
      this.input = audioContext.createGain();
      this.output = audioContext.createGain();
      this.processors = new Map();
      this.connections = [];
      this.isActive = false;
    }

    addProcessor(type, processor) {
      this.processors.set(type, processor);

      // Rebuild chain
      this.rebuildChain();
    }

    removeProcessor(type) {
      if (this.processors.has(type)) {
        const processor = this.processors.get(type);
        if (processor.disconnect) {
          processor.disconnect();
        }
        this.processors.delete(type);
        this.rebuildChain();
      }
    }

    rebuildChain() {
      // Disconnect all existing connections
      this.connections.forEach(connection => {
        try {
          connection.source.disconnect(connection.destination);
        } catch (e) {
          // Connection may already be disconnected
        }
      });
      this.connections = [];

      // Build processing chain
      let currentNode = this.input;

      // Order processors by priority
      const processorOrder = [
        AUDIO_PROCESSING_TYPES.NOISE_REDUCTION,
        AUDIO_PROCESSING_TYPES.ECHO_CANCELLATION,
        AUDIO_PROCESSING_TYPES.VOICE_ISOLATION,
        AUDIO_PROCESSING_TYPES.REVERB_REMOVAL,
        AUDIO_PROCESSING_TYPES.PITCH_CORRECTION,
        AUDIO_PROCESSING_TYPES.EQUALIZATION,
        AUDIO_PROCESSING_TYPES.COMPRESSION,
        AUDIO_PROCESSING_TYPES.LIMITING,
        AUDIO_PROCESSING_TYPES.VOLUME_NORMALIZATION,
        AUDIO_PROCESSING_TYPES.STEREO_ENHANCEMENT
      ];

      for (const processorType of processorOrder) {
        const processor = this.processors.get(processorType);
        if (processor) {
          this.connections.push({
            source: currentNode,
            destination: processor.input || processor
          });
          currentNode.connect(processor.input || processor);

          currentNode = processor.output || processor;
        }
      }

      // Connect to output
      this.connections.push({
        source: currentNode,
        destination: this.output
      });
      currentNode.connect(this.output);
    }

    connect(destination) {
      this.output.connect(destination);
    }

    disconnect(destination) {
      if (destination) {
        this.output.disconnect(destination);
      } else {
        this.output.disconnect();
      }
    }

    getProcessor(type) {
      return this.processors.get(type);
    }

    setParameter(type, parameter, value) {
      const processor = this.processors.get(type);
      if (processor && processor.setParameter) {
        processor.setParameter(parameter, value);
      }
    }

    getParameter(type, parameter) {
      const processor = this.processors.get(type);
      if (processor && processor.getParameter) {
        return processor.getParameter(parameter);
      }
      return null;
    }

    enable() {
      this.isActive = true;
      this.input.gain.value = 1;
    }

    disable() {
      this.isActive = false;
      this.input.gain.value = 0;
    }

    dispose() {
      this.disable();
      this.disconnect();

      this.processors.forEach(processor => {
        if (processor.dispose) {
          processor.dispose();
        }
      });

      this.processors.clear();
      this.connections = [];
    }
  }

  // Noise Reduction Processor
  class NoiseReductionProcessor {
    constructor(audioContext) {
      this.audioContext = audioContext;
      this.input = audioContext.createGain();
      this.output = audioContext.createGain();

      // Noise reduction parameters
      this.noiseThreshold = 0.01;
      this.reductionAmount = 0.8;
      this.attackTime = 0.01;
      this.releaseTime = 0.1;

      // Analysis nodes
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);

      // Noise profile (will be learned)
      this.noiseProfile = null;
      this.isLearning = false;

      // Build processing chain
      this.buildChain();
    }

    buildChain() {
      // Connect input to analyser
      this.input.connect(this.analyser);

      // Create noise gate
      this.noiseGate = this.audioContext.createDynamicsCompressor();
      this.noiseGate.threshold.value = -60; // dB
      this.noiseGate.knee.value = 30;
      this.noiseGate.ratio.value = 12;
      this.noiseGate.attack.value = this.attackTime;
      this.noiseGate.release.value = this.releaseTime;

      // Connect through noise gate
      this.input.connect(this.noiseGate);
      this.noiseGate.connect(this.output);
    }

    learnNoise(duration = 1000) {
      return new Promise((resolve) => {
        this.isLearning = true;
        this.noiseProfile = new Float32Array(this.analyser.frequencyBinCount);

        let sampleCount = 0;
        const maxSamples = (duration / 100) * 60; // 60 FPS equivalent

        const collectSample = () => {
          if (!this.isLearning) return;

          this.analyser.getFloatFrequencyData(this.frequencyData);

          // Accumulate samples
          for (let i = 0; i < this.frequencyData.length; i++) {
            this.noiseProfile[i] += this.frequencyData[i];
          }
          sampleCount++;

          if (sampleCount >= maxSamples) {
            // Average the samples
            for (let i = 0; i < this.noiseProfile.length; i++) {
              this.noiseProfile[i] /= sampleCount;
            }

            this.isLearning = false;
            resolve(this.noiseProfile);
          } else {
            setTimeout(collectSample, 16); // ~60 FPS
          }
        };

        collectSample();
      });
    }

    processNoiseReduction() {
      if (!this.noiseProfile) return;

      this.analyser.getFloatFrequencyData(this.frequencyData);

      // Apply spectral subtraction
      for (let i = 0; i < this.frequencyData.length; i++) {
        const noiseLevel = this.noiseProfile[i];
        const signalLevel = this.frequencyData[i];

        if (signalLevel < noiseLevel + this.noiseThreshold) {
          // Reduce noise
          const reduction = Math.max(0, 1 - this.reductionAmount);
          this.frequencyData[i] *= reduction;
        }
      }

      // This is a simplified implementation
      // Real noise reduction would use more sophisticated algorithms
    }

    setParameter(name, value) {
      switch (name) {
        case 'threshold':
          this.noiseThreshold = value;
          break;
        case 'reduction':
          this.reductionAmount = value;
          break;
        case 'attack':
          this.attackTime = value;
          this.noiseGate.attack.value = value;
          break;
        case 'release':
          this.releaseTime = value;
          this.noiseGate.release.value = value;
          break;
      }
    }

    getParameter(name) {
      switch (name) {
        case 'threshold':
          return this.noiseThreshold;
        case 'reduction':
          return this.reductionAmount;
        case 'attack':
          return this.attackTime;
        case 'release':
          return this.releaseTime;
      }
      return null;
    }

    dispose() {
      this.input.disconnect();
      this.output.disconnect();
    }
  }

  // Voice Isolation Processor
  class VoiceIsolationProcessor {
    constructor(audioContext) {
      this.audioContext = audioContext;
      this.input = audioContext.createGain();
      this.output = audioContext.createGain();

      // Voice isolation parameters
      this.voiceRange = { min: 85, max: 255 }; // Hz (F3 to C5)
      this.isolationStrength = 0.8;
      this.harmonicEnhancement = 0.3;

      // Analysis nodes
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 2048;

      // Filter nodes for voice isolation
      this.lowPassFilter = audioContext.createBiquadFilter();
      this.lowPassFilter.type = 'lowpass';
      this.lowPassFilter.frequency.value = this.voiceRange.max;
      this.lowPassFilter.Q.value = 1;

      this.highPassFilter = audioContext.createBiquadFilter();
      this.highPassFilter.type = 'highpass';
      this.highPassFilter.frequency.value = this.voiceRange.min;
      this.highPassFilter.Q.value = 1;

      // Build processing chain
      this.buildChain();
    }

    buildChain() {
      // Connect input to analyser
      this.input.connect(this.analyser);

      // Voice isolation chain
      this.input.connect(this.highPassFilter);
      this.highPassFilter.connect(this.lowPassFilter);
      this.lowPassFilter.connect(this.output);

      // Add harmonic enhancement
      this.harmonicEnhancer = this.createHarmonicEnhancer();
      this.lowPassFilter.connect(this.harmonicEnhancer);
      this.harmonicEnhancer.connect(this.output);
    }

    createHarmonicEnhancer() {
      // Simple harmonic enhancement using delay and gain
      const delay = this.audioContext.createDelay(0.01); // 10ms delay
      const gain = this.audioContext.createGain();
      gain.gain.value = this.harmonicEnhancement;

      delay.connect(gain);
      return gain;
    }

    setParameter(name, value) {
      switch (name) {
        case 'voiceRangeMin':
          this.voiceRange.min = value;
          this.highPassFilter.frequency.value = value;
          break;
        case 'voiceRangeMax':
          this.voiceRange.max = value;
          this.lowPassFilter.frequency.value = value;
          break;
        case 'isolationStrength':
          this.isolationStrength = value;
          // Adjust filter Q based on strength
          this.lowPassFilter.Q.value = 1 + value * 5;
          this.highPassFilter.Q.value = 1 + value * 5;
          break;
        case 'harmonicEnhancement':
          this.harmonicEnhancement = value;
          if (this.harmonicEnhancer) {
            this.harmonicEnhancer.gain.value = value;
          }
          break;
      }
    }

    getParameter(name) {
      switch (name) {
        case 'voiceRangeMin':
          return this.voiceRange.min;
        case 'voiceRangeMax':
          return this.voiceRange.max;
        case 'isolationStrength':
          return this.isolationStrength;
        case 'harmonicEnhancement':
          return this.harmonicEnhancement;
      }
      return null;
    }

    dispose() {
      this.input.disconnect();
      this.output.disconnect();
    }
  }

  // Automatic Mixing Processor
  class AutomaticMixingProcessor {
    constructor(audioContext) {
      this.audioContext = audioContext;
      this.input = audioContext.createGain();
      this.output = audioContext.createGain();

      // Mixing parameters
      this.targetLoudness = -23; // LUFS
      this.dynamicRange = 8; // dB
      this.compressorRatio = 4;
      this.makeupGain = 2;

      // Analysis nodes
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 2048;

      // Processing nodes
      this.compressor = audioContext.createDynamicsCompressor();
      this.compressor.threshold.value = -24;
      this.compressor.knee.value = 30;
      this.compressor.ratio.value = this.compressorRatio;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.25;

      this.makeupGainNode = audioContext.createGain();
      this.makeupGainNode.gain.value = this.dbToGain(this.makeupGain);

      // Build processing chain
      this.buildChain();
    }

    buildChain() {
      // Connect input to analyser
      this.input.connect(this.analyser);

      // Automatic mixing chain
      this.input.connect(this.compressor);
      this.compressor.connect(this.makeupGainNode);
      this.makeupGainNode.connect(this.output);
    }

    analyzeLoudness(buffer, sampleRate) {
      // Simplified loudness analysis (would use EBU R128 in production)
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        sum += buffer[i] * buffer[i];
      }

      const rms = Math.sqrt(sum / buffer.length);
      const loudness = 20 * Math.log10(rms);

      return loudness;
    }

    normalizeAudio(audioBuffer) {
      const loudness = this.analyzeLoudness(audioBuffer.getChannelData(0), audioBuffer.sampleRate);
      const gainAdjustment = this.targetLoudness - loudness;
      const gain = this.dbToGain(gainAdjustment);

      // Apply normalization
      this.makeupGainNode.gain.value = gain;
    }

    dbToGain(db) {
      return Math.pow(10, db / 20);
    }

    setParameter(name, value) {
      switch (name) {
        case 'targetLoudness':
          this.targetLoudness = value;
          break;
        case 'dynamicRange':
          this.dynamicRange = value;
          this.compressor.ratio.value = 1 + (value / 2);
          break;
        case 'compressorRatio':
          this.compressorRatio = value;
          this.compressor.ratio.value = value;
          break;
        case 'makeupGain':
          this.makeupGain = value;
          this.makeupGainNode.gain.value = this.dbToGain(value);
          break;
      }
    }

    getParameter(name) {
      switch (name) {
        case 'targetLoudness':
          return this.targetLoudness;
        case 'dynamicRange':
          return this.dynamicRange;
        case 'compressorRatio':
          return this.compressorRatio;
        case 'makeupGain':
          return this.makeupGain;
      }
      return null;
    }

    dispose() {
      this.input.disconnect();
      this.output.disconnect();
    }
  }

  // Audio Analysis Engine
  class AudioAnalysisEngine {
    constructor(audioContext) {
      this.audioContext = audioContext;
      this.analyser = audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.frequencyData = new Float32Array(this.analyser.frequencyBinCount);
      this.timeData = new Float32Array(this.analyser.frequencyBinCount);
      this.isAnalyzing = false;
    }

    connect(source) {
      source.connect(this.analyser);
    }

    startAnalysis(callback) {
      this.isAnalyzing = true;
      this.analyze(callback);
    }

    stopAnalysis() {
      this.isAnalyzing = false;
    }

    analyze(callback) {
      if (!this.isAnalyzing) return;

      this.analyser.getFloatFrequencyData(this.frequencyData);
      this.analyser.getFloatTimeDomainData(this.timeData);

      const analysis = {
        frequency: this.frequencyData,
        time: this.timeData,
        rms: this.calculateRMS(),
        peak: this.calculatePeak(),
        spectrum: this.getFrequencySpectrum(),
        isSilent: this.detectSilence(),
        fundamentalFrequency: this.detectPitch()
      };

      callback(analysis);

      // Continue analysis
      requestAnimationFrame(() => this.analyze(callback));
    }

    calculateRMS() {
      let sum = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        sum += this.timeData[i] * this.timeData[i];
      }
      return Math.sqrt(sum / this.timeData.length);
    }

    calculatePeak() {
      let peak = 0;
      for (let i = 0; i < this.timeData.length; i++) {
        peak = Math.max(peak, Math.abs(this.timeData[i]));
      }
      return peak;
    }

    getFrequencySpectrum() {
      const spectrum = [];
      const nyquist = this.audioContext.sampleRate / 2;
      const binSize = nyquist / this.frequencyData.length;

      for (let i = 0; i < this.frequencyData.length; i++) {
        spectrum.push({
          frequency: i * binSize,
          magnitude: this.frequencyData[i]
        });
      }

      return spectrum;
    }

    detectSilence(threshold = 0.001) {
      return this.calculateRMS() < threshold;
    }

    detectPitch() {
      // Simplified pitch detection using autocorrelation
      // In production, this would use more sophisticated algorithms
      const bufferSize = this.timeData.length;
      const correlations = new Array(bufferSize);

      for (let lag = 0; lag < bufferSize; lag++) {
        let correlation = 0;
        for (let i = 0; i < bufferSize - lag; i++) {
          correlation += this.timeData[i] * this.timeData[i + lag];
        }
        correlations[lag] = correlation;
      }

      // Find peak in autocorrelation
      let maxCorrelation = 0;
      let bestLag = 0;

      for (let lag = 20; lag < Math.min(bufferSize / 2, 1000); lag++) {
        if (correlations[lag] > maxCorrelation) {
          maxCorrelation = correlations[lag];
          bestLag = lag;
        }
      }

      if (bestLag > 0) {
        const fundamentalFrequency = this.audioContext.sampleRate / bestLag;
        return fundamentalFrequency;
      }

      return null;
    }

    detectBeats() {
      // Simplified beat detection
      // In production, this would use spectral flux or complex algorithms
      const energy = this.calculateRMS();
      const threshold = 0.1; // Would be adaptive in production

      return energy > threshold;
    }

    dispose() {
      this.stopAnalysis();
    }
  }

  // Audio Enhancement Suite
  class AudioEnhancementSuite {
    constructor(audioContext) {
      this.audioContext = audioContext;
      this.processingChains = new Map();
      this.analysisEngine = new AudioAnalysisEngine(audioContext);
      this.enhancementProfiles = new Map();

      this.initializeEnhancementProfiles();
    }

    initializeEnhancementProfiles() {
      // Podcast enhancement profile
      this.enhancementProfiles.set('podcast', {
        processors: [
          { type: AUDIO_PROCESSING_TYPES.NOISE_REDUCTION, params: { threshold: 0.02, reduction: 0.7 } },
          { type: AUDIO_PROCESSING_TYPES.ECHO_CANCELLATION, params: {} },
          { type: AUDIO_PROCESSING_TYPES.VOLUME_NORMALIZATION, params: { targetLoudness: -20 } },
          { type: AUDIO_PROCESSING_TYPES.COMPRESSION, params: { ratio: 3, threshold: -18 } }
        ]
      });

      // Music enhancement profile
      this.enhancementProfiles.set('music', {
        processors: [
          { type: AUDIO_PROCESSING_TYPES.EQUALIZATION, params: { bass: 2, treble: 1 } },
          { type: AUDIO_PROCESSING_TYPES.COMPRESSION, params: { ratio: 4, threshold: -16 } },
          { type: AUDIO_PROCESSING_TYPES.LIMITING, params: { threshold: -6 } },
          { type: AUDIO_PROCESSING_TYPES.STEREO_ENHANCEMENT, params: {} }
        ]
      });

      // Voice over enhancement profile
      this.enhancementProfiles.set('voice_over', {
        processors: [
          { type: AUDIO_PROCESSING_TYPES.VOICE_ISOLATION, params: { isolationStrength: 0.9 } },
          { type: AUDIO_PROCESSING_TYPES.NOISE_REDUCTION, params: { threshold: 0.01, reduction: 0.8 } },
          { type: AUDIO_PROCESSING_TYPES.PITCH_CORRECTION, params: {} },
          { type: AUDIO_PROCESSING_TYPES.COMPRESSION, params: { ratio: 2, threshold: -20 } }
        ]
      });

      // Film audio enhancement profile
      this.enhancementProfiles.set('film_audio', {
        processors: [
          { type: AUDIO_PROCESSING_TYPES.REVERB_REMOVAL, params: {} },
          { type: AUDIO_PROCESSING_TYPES.EQUALIZATION, params: { bass: -1, mid: 1, treble: 0.5 } },
          { type: AUDIO_PROCESSING_TYPES.COMPRESSION, params: { ratio: 2.5, threshold: -18 } },
          { type: AUDIO_PROCESSING_TYPES.LIMITING, params: { threshold: -8 } }
        ]
      });
    }

    createProcessingChain(name, source, destination) {
      const chain = new AudioProcessingChain(this.audioContext);
      source.connect(chain.input);
      chain.output.connect(destination);

      this.processingChains.set(name, chain);
      return chain;
    }

    applyEnhancementProfile(chainName, profileName) {
      const chain = this.processingChains.get(chainName);
      const profile = this.enhancementProfiles.get(profileName);

      if (!chain || !profile) return;

      // Clear existing processors
      chain.processors.forEach((_, type) => chain.removeProcessor(type));

      // Add processors from profile
      for (const { type, params } of profile.processors) {
        const processor = this.createProcessor(type);
        if (processor) {
          chain.addProcessor(type, processor);

          // Apply parameters
          Object.entries(params).forEach(([param, value]) => {
            processor.setParameter(param, value);
          });
        }
      }
    }

    createProcessor(type) {
      switch (type) {
        case AUDIO_PROCESSING_TYPES.NOISE_REDUCTION:
          return new NoiseReductionProcessor(this.audioContext);
        case AUDIO_PROCESSING_TYPES.VOICE_ISOLATION:
          return new VoiceIsolationProcessor(this.audioContext);
        case AUDIO_PROCESSING_TYPES.VOLUME_NORMALIZATION:
          return new AutomaticMixingProcessor(this.audioContext);
        default:
          console.warn(`Processor type ${type} not implemented`);
          return null;
      }
    }

    startAnalysis(source, callback) {
      this.analysisEngine.connect(source);
      this.analysisEngine.startAnalysis(callback);
    }

    stopAnalysis() {
      this.analysisEngine.stopAnalysis();
    }

    getAvailableProfiles() {
      return Array.from(this.enhancementProfiles.keys());
    }

    getProfileDetails(profileName) {
      return this.enhancementProfiles.get(profileName);
    }

    dispose() {
      this.processingChains.forEach(chain => chain.dispose());
      this.processingChains.clear();
      this.analysisEngine.dispose();
    }
  }

  // Audio Effects Library
  const AudioEffectsLibrary = {
    // Reverb effect
    createReverb(audioContext, duration = 2, decay = 2, mix = 0.3) {
      const convolver = audioContext.createConvolver();
      const wetGain = audioContext.createGain();
      const dryGain = audioContext.createGain();

      // Create impulse response
      const sampleRate = audioContext.sampleRate;
      const length = sampleRate * duration;
      const impulse = audioContext.createBuffer(2, length, sampleRate);

      for (let channel = 0; channel < 2; channel++) {
        const channelData = impulse.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          channelData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
        }
      }

      convolver.buffer = impulse;
      wetGain.gain.value = mix;
      dryGain.gain.value = 1 - mix;

      return {
        input: audioContext.createGain(),
        output: audioContext.createGain(),
        connect(destination) {
          this.input.connect(convolver);
          this.input.connect(dryGain);
          convolver.connect(wetGain);
          wetGain.connect(this.output);
          dryGain.connect(this.output);
          this.output.connect(destination);
        },
        dispose() {
          this.input.disconnect();
          this.output.disconnect();
        }
      };
    },

    // Delay effect
    createDelay(audioContext, time = 0.3, feedback = 0.4, mix = 0.3) {
      const delayNode = audioContext.createDelay(1);
      const feedbackGain = audioContext.createGain();
      const wetGain = audioContext.createGain();
      const dryGain = audioContext.createGain();

      delayNode.delayTime.value = time;
      feedbackGain.gain.value = feedback;
      wetGain.gain.value = mix;
      dryGain.gain.value = 1 - mix;

      return {
        input: audioContext.createGain(),
        output: audioContext.createGain(),
        connect(destination) {
          this.input.connect(delayNode);
          this.input.connect(dryGain);
          delayNode.connect(feedbackGain);
          feedbackGain.connect(delayNode);
          delayNode.connect(wetGain);
          wetGain.connect(this.output);
          dryGain.connect(this.output);
          this.output.connect(destination);
        },
        dispose() {
          this.input.disconnect();
          this.output.disconnect();
        }
      };
    },

    // Chorus effect
    createChorus(audioContext, rate = 1.5, depth = 0.002, mix = 0.3) {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const delay = audioContext.createDelay(0.005);
      const wetGain = audioContext.createGain();
      const dryGain = audioContext.createGain();

      oscillator.frequency.value = rate;
      gain.gain.value = depth;
      wetGain.gain.value = mix;
      dryGain.gain.value = 1 - mix;

      oscillator.connect(gain);
      gain.connect(delay.delayTime);

      return {
        input: audioContext.createGain(),
        output: audioContext.createGain(),
        start() {
          oscillator.start();
        },
        connect(destination) {
          this.input.connect(delay);
          this.input.connect(dryGain);
          delay.connect(wetGain);
          wetGain.connect(this.output);
          dryGain.connect(this.output);
          this.output.connect(destination);
        },
        dispose() {
          oscillator.stop();
          this.input.disconnect();
          this.output.disconnect();
        }
      };
    }
  };

  // Global audio processing manager
  const audioProcessingManager = {
    audioContext: null,
    enhancementSuite: null,
    effectsLibrary: AudioEffectsLibrary,

    async initialize() {
      try {
        this.audioContext = new (global.AudioContext || global.webkitAudioContext)();
        this.enhancementSuite = new AudioEnhancementSuite(this.audioContext);

        console.log('Audio processing system initialized');
      } catch (error) {
        console.error('Failed to initialize audio processing system:', error);
      }
    },

    createProcessingChain(name, source, destination) {
      return this.enhancementSuite.createProcessingChain(name, source, destination);
    },

    applyEnhancementProfile(chainName, profileName) {
      return this.enhancementSuite.applyEnhancementProfile(chainName, profileName);
    },

    startAnalysis(source, callback) {
      return this.enhancementSuite.startAnalysis(source, callback);
    },

    stopAnalysis() {
      return this.enhancementSuite.stopAnalysis();
    },

    getAvailableProfiles() {
      return this.enhancementSuite.getAvailableProfiles();
    },

    createEffect(type, ...args) {
      return this.effectsLibrary[`create${type.charAt(0).toUpperCase() + type.slice(1)}`](this.audioContext, ...args);
    },

    dispose() {
      if (this.enhancementSuite) {
        this.enhancementSuite.dispose();
      }
    }
  };

  // Initialize on load
  if (typeof global.document !== 'undefined') {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', () => {
        audioProcessingManager.initialize();
      });
    } else {
      audioProcessingManager.initialize();
    }
  }

  // Export audio processing functionality
  global.AudioProcessingManager = audioProcessingManager;
  global.AudioEnhancementSuite = AudioEnhancementSuite;
  global.AudioAnalysisEngine = AudioAnalysisEngine;
  global.AudioEffectsLibrary = AudioEffectsLibrary;

  // Constants
  global.AUDIO_PROCESSING_TYPES = AUDIO_PROCESSING_TYPES;
  global.AUDIO_ANALYSIS_TYPES = AUDIO_ANALYSIS_TYPES;

})(typeof window !== 'undefined' ? window : globalThis);
