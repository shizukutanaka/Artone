'use strict';

/**
 * Universal Project Compatibility Manager for Artone Video Editor
 * Supports importing/exporting projects from various video editing software
 */
(function registerProjectCompatibilitySystem(global) {
  'use strict';

  const SUPPORTED_FORMATS = {
    artone: {
      extension: '.artone',
      name: 'Artone Project',
      canImport: true,
      canExport: true,
      description: 'Native Artone project format'
    },
    premiere: {
      extension: '.prproj',
      name: 'Adobe Premiere Pro',
      canImport: true,
      canExport: false,
      description: 'Adobe Premiere Pro project file'
    },
    finalcut: {
      extension: '.fcpbundle',
      name: 'Final Cut Pro',
      canImport: true,
      canExport: false,
      description: 'Apple Final Cut Pro project bundle'
    },
    resolve: {
      extension: '.drp',
      name: 'DaVinci Resolve',
      canImport: true,
      canExport: false,
      description: 'DaVinci Resolve project file'
    },
    avid: {
      extension: '.avp',
      name: 'Avid Media Composer',
      canImport: true,
      canExport: false,
      description: 'Avid Media Composer project file'
    },
    xml: {
      extension: '.xml',
      name: 'FCP XML',
      canImport: true,
      canExport: true,
      description: 'Final Cut Pro XML interchange format'
    },
    aaf: {
      extension: '.aaf',
      name: 'AAF',
      canImport: true,
      canExport: true,
      description: 'Advanced Authoring Format'
    },
    edl: {
      extension: '.edl',
      name: 'EDL',
      canImport: true,
      canExport: true,
      description: 'Edit Decision List'
    }
  };

  class ProjectCompatibilityManager {
    constructor() {
      this.importers = new Map();
      this.exporters = new Map();
      this.conversionRules = new Map();
      this.metadataHandlers = new Map();

      this.initializeHandlers();
    }

    initializeHandlers() {
      // Register format handlers
      this.registerImporter('artone', this.importArtoneProject.bind(this));
      this.registerExporter('artone', this.exportArtoneProject.bind(this));

      this.registerImporter('xml', this.importFCPXML.bind(this));
      this.registerExporter('xml', this.exportFCPXML.bind(this));

      this.registerImporter('edl', this.importEDL.bind(this));
      this.registerExporter('edl', this.exportEDL.bind(this));

      this.registerImporter('aaf', this.importAAF.bind(this));
      this.registerExporter('aaf', this.exportAAF.bind(this));

      // Basic support for other formats (would need full implementations)
      this.registerImporter('premiere', this.importPremiereProject.bind(this));
      this.registerImporter('finalcut', this.importFinalCutProject.bind(this));
      this.registerImporter('resolve', this.importResolveProject.bind(this));
      this.registerImporter('avid', this.importAvidProject.bind(this));

      // Set up conversion rules
      this.setupConversionRules();
    }

    registerImporter(format, handler) {
      this.importers.set(format, handler);
    }

    registerExporter(format, handler) {
      this.exporters.set(format, handler);
    }

    getSupportedFormats() {
      return { ...SUPPORTED_FORMATS };
    }

    canImport(format) {
      return SUPPORTED_FORMATS[format]?.canImport || false;
    }

    canExport(format) {
      return SUPPORTED_FORMATS[format]?.canExport || false;
    }

    async importProject(file, format, options = {}) {
      const importer = this.importers.get(format);
      if (!importer) {
        throw new Error(`Unsupported import format: ${format}`);
      }

      try {
        const projectData = await this.readFile(file);
        const artoneProject = await importer(projectData, options);

        // Apply conversion rules
        const convertedProject = this.applyConversionRules(artoneProject, format, 'artone');

        return {
          success: true,
          project: convertedProject,
          warnings: this.collectWarnings(),
          metadata: this.extractMetadata(projectData, format)
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          project: null
        };
      }
    }

    async exportProject(project, format, options = {}) {
      const exporter = this.exporters.get(format);
      if (!exporter) {
        throw new Error(`Unsupported export format: ${format}`);
      }

      try {
        // Apply conversion rules
        const convertedProject = this.applyConversionRules(project, 'artone', format);

        const exportedData = await exporter(convertedProject, options);

        return {
          success: true,
          data: exportedData,
          blob: this.createBlob(exportedData, format),
          filename: this.generateFilename(project, format)
        };
      } catch (error) {
        return {
          success: false,
          error: error.message
        };
      }
    }

    // File I/O helpers
    async readFile(file) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target.result);
        reader.onerror = (e) => reject(new Error('Failed to read file'));
        reader.readAsText(file);
      });
    }

    createBlob(data, format) {
      const mimeTypes = {
        xml: 'application/xml',
        aaf: 'application/octet-stream',
        edl: 'text/plain',
        artone: 'application/json'
      };

      const mimeType = mimeTypes[format] || 'application/octet-stream';
      return new Blob([data], { type: mimeType });
    }

    generateFilename(project, format) {
      const baseName = project.name || 'Untitled Project';
      const extension = SUPPORTED_FORMATS[format]?.extension || '.unknown';
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');

      return `${baseName}_${timestamp}${extension}`;
    }

    // Import handlers
    async importArtoneProject(data, options) {
      // Native Artone format - just parse JSON
      return JSON.parse(data);
    }

    async importFCPXML(data, options) {
      // Parse Final Cut Pro XML
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(data, 'text/xml');

      return this.convertFCPXMLToArtone(xmlDoc);
    }

    async importEDL(data, options) {
      // Parse Edit Decision List
      const lines = data.split('\n');
      return this.convertEDLToArtone(lines);
    }

    async importAAF(data, options) {
      // Parse AAF file (simplified)
      // AAF is a complex binary format, this would need proper AAF library
      console.warn('AAF import is not fully implemented');
      return this.createBasicProject('Imported AAF Project');
    }

    async importPremiereProject(data, options) {
      // Premiere Pro projects are binary/complex XML
      // This is a simplified placeholder
      console.warn('Premiere Pro import is not fully implemented');
      return this.createBasicProject('Imported Premiere Project');
    }

    async importFinalCutProject(data, options) {
      // Final Cut Pro bundles are complex
      // This is a simplified placeholder
      console.warn('Final Cut Pro import is not fully implemented');
      return this.createBasicProject('Imported Final Cut Project');
    }

    async importResolveProject(data, options) {
      // DaVinci Resolve projects are complex
      // This is a simplified placeholder
      console.warn('DaVinci Resolve import is not fully implemented');
      return this.createBasicProject('Imported Resolve Project');
    }

    async importAvidProject(data, options) {
      // Avid projects are complex
      // This is a simplified placeholder
      console.warn('Avid import is not fully implemented');
      return this.createBasicProject('Imported Avid Project');
    }

    // Export handlers
    async exportArtoneProject(project, options) {
      return JSON.stringify(project, null, 2);
    }

    async exportFCPXML(project, options) {
      return this.convertArtoneToFCPXML(project);
    }

    async exportEDL(project, options) {
      return this.convertArtoneToEDL(project);
    }

    async exportAAF(project, options) {
      // Simplified AAF export
      console.warn('AAF export is not fully implemented');
      return 'AAF export not implemented';
    }

    // Conversion methods
    convertFCPXMLToArtone(xmlDoc) {
      const project = this.createBasicProject('Imported FCP XML');

      try {
        // Extract basic project information
        const projectName = xmlDoc.querySelector('project')?.getAttribute('name') || 'Imported Project';
        project.name = projectName;

        // Extract sequence information
        const sequence = xmlDoc.querySelector('sequence');
        if (sequence) {
          const sequenceName = sequence.getAttribute('name') || 'Sequence 1';
          const duration = this.parseFCPTimecode(sequence.querySelector('duration')?.textContent);

          project.timeline = {
            sequences: [{
              id: 'seq_1',
              name: sequenceName,
              duration: duration,
              tracks: []
            }]
          };
        }

        // Extract clips (simplified)
        const videoTracks = xmlDoc.querySelectorAll('video track');
        videoTracks.forEach((track, index) => {
          const clips = track.querySelectorAll('clip');
          const trackClips = [];

          clips.forEach((clip, clipIndex) => {
            const clipData = {
              id: `clip_${index}_${clipIndex}`,
              name: clip.getAttribute('name') || `Clip ${clipIndex + 1}`,
              startTime: this.parseFCPTimecode(clip.querySelector('start')?.textContent) || 0,
              duration: this.parseFCPTimecode(clip.querySelector('duration')?.textContent) || 0,
              mediaPath: clip.querySelector('pathurl')?.textContent || ''
            };
            trackClips.push(clipData);
          });

          if (trackClips.length > 0) {
            project.timeline.sequences[0].tracks.push({
              id: `track_${index}`,
              type: 'video',
              clips: trackClips
            });
          }
        });

      } catch (error) {
        console.error('Error parsing FCP XML:', error);
      }

      return project;
    }

    convertEDLToArtone(lines) {
      const project = this.createBasicProject('Imported EDL');

      try {
        let currentEvent = null;
        const events = [];

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith('*')) continue;

          // Parse EDL event (simplified CMX 3600 format)
          const parts = trimmed.split(/\s+/);
          if (parts.length >= 8) {
            const eventNumber = parseInt(parts[0]);
            const reel = parts[1];
            const track = parts[2];
            const editType = parts[3];
            const startTime = this.parseEDLTimecode(parts[4]);
            const endTime = this.parseEDLTimecode(parts[5]);
            const duration = this.parseEDLTimecode(parts[6]);

            if (editType === 'V' || editType === 'A') {
              events.push({
                number: eventNumber,
                reel: reel,
                track: track,
                type: editType,
                startTime: startTime,
                endTime: endTime,
                duration: duration
              });
            }
          }
        }

        // Convert events to Artone timeline
        const videoEvents = events.filter(e => e.type === 'V');
        const tracks = [];

        // Group by track
        const trackGroups = {};
        videoEvents.forEach(event => {
          if (!trackGroups[event.track]) {
            trackGroups[event.track] = [];
          }
          trackGroups[event.track].push(event);
        });

        Object.keys(trackGroups).forEach(trackId => {
          tracks.push({
            id: `track_${trackId}`,
            type: 'video',
            clips: trackGroups[trackId].map(event => ({
              id: `clip_${event.number}`,
              name: `Clip ${event.number}`,
              startTime: event.startTime,
              duration: event.duration,
              mediaPath: event.reel // Placeholder
            }))
          });
        });

        project.timeline = {
          sequences: [{
            id: 'seq_1',
            name: 'Imported Sequence',
            duration: Math.max(...events.map(e => e.endTime), 0),
            tracks: tracks
          }]
        };

      } catch (error) {
        console.error('Error parsing EDL:', error);
      }

      return project;
    }

    convertArtoneToFCPXML(project) {
      // Simplified FCP XML export
      let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xml += '<!DOCTYPE fcpxml>\n';
      xml += '<fcpxml version="1.9">\n';
      xml += `  <project name="${project.name || 'Exported Project'}">\n`;

      if (project.timeline?.sequences?.[0]) {
        const sequence = project.timeline.sequences[0];
        xml += `    <sequence name="${sequence.name}">\n`;
        xml += `      <duration>${this.formatFCPTimecode(sequence.duration)}</duration>\n`;

        sequence.tracks?.forEach(track => {
          if (track.type === 'video') {
            xml += '      <video track="1">\n';
            track.clips?.forEach(clip => {
              xml += `        <clip name="${clip.name}">\n`;
              xml += `          <start>${this.formatFCPTimecode(clip.startTime)}</start>\n`;
              xml += `          <duration>${this.formatFCPTimecode(clip.duration)}</duration>\n`;
              xml += `          <pathurl>${clip.mediaPath || ''}</pathurl>\n`;
              xml += '        </clip>\n';
            });
            xml += '      </video>\n';
          }
        });

        xml += '    </sequence>\n';
      }

      xml += '  </project>\n';
      xml += '</fcpxml>\n';

      return xml;
    }

    convertArtoneToEDL(project) {
      // Simplified EDL export (CMX 3600 format)
      let edl = 'TITLE: Exported from Artone\n';
      edl += 'FCM: NON-DROP FRAME\n\n';

      let eventNumber = 1;

      if (project.timeline?.sequences?.[0]) {
        const sequence = project.timeline.sequences[0];

        sequence.tracks?.forEach((track, trackIndex) => {
          if (track.type === 'video') {
            track.clips?.forEach((clip, clipIndex) => {
              const startTime = this.formatEDLTimecode(clip.startTime);
              const endTime = this.formatEDLTimecode(clip.startTime + clip.duration);

              edl += `${String(eventNumber).padStart(5)}  `;
              edl += `${clip.mediaPath || 'AX'}${String(clipIndex + 1).padStart(3, '0')} `;
              edl += 'V     C        ';
              edl += `${startTime} ${endTime} `;
              edl += `${this.formatEDLTimecode(clip.duration)} `;
              edl += `${startTime} ${endTime}\n`;

              // Add source file information
              edl += `* FROM CLIP NAME: ${clip.name}\n\n`;

              eventNumber++;
            });
          }
        });
      }

      return edl;
    }

    // Helper methods
    createBasicProject(name) {
      return {
        name: name,
        version: '1.0',
        created: new Date().toISOString(),
        timeline: {
          sequences: [{
            id: 'seq_1',
            name: 'Sequence 1',
            duration: 0,
            tracks: []
          }]
        },
        media: [],
        effects: []
      };
    }

    setupConversionRules() {
      // Define conversion rules for different formats
      this.conversionRules.set('premiere-to-artone', {
        timecodeMultiplier: 1, // Premiere uses frames
        coordinateSystem: 'cartesian'
      });

      this.conversionRules.set('finalcut-to-artone', {
        timecodeMultiplier: 1/30, // FCP uses seconds at 30fps
        coordinateSystem: 'cartesian'
      });

      this.conversionRules.set('resolve-to-artone', {
        timecodeMultiplier: 1,
        coordinateSystem: 'cartesian'
      });
    }

    applyConversionRules(project, fromFormat, toFormat) {
      const ruleKey = `${fromFormat}-to-${toFormat}`;
      const rules = this.conversionRules.get(ruleKey);

      if (!rules) {
        return project; // No conversion needed
      }

      // Apply timecode conversion
      if (rules.timecodeMultiplier && rules.timecodeMultiplier !== 1) {
        this.convertTimecodes(project, rules.timecodeMultiplier);
      }

      return project;
    }

    convertTimecodes(project, multiplier) {
      // Recursively convert all timecodes in the project
      const convert = (obj) => {
        for (const key in obj) {
          if (typeof obj[key] === 'number' && this.isTimecodeField(key)) {
            obj[key] *= multiplier;
          } else if (typeof obj[key] === 'object' && obj[key] !== null) {
            convert(obj[key]);
          }
        }
      };

      convert(project);
    }

    isTimecodeField(fieldName) {
      const timecodeFields = ['startTime', 'endTime', 'duration', 'start', 'end'];
      return timecodeFields.includes(fieldName) || fieldName.toLowerCase().includes('time');
    }

    parseFCPTimecode(timecode) {
      if (!timecode) return 0;
      // Simplified timecode parsing - assumes 30fps
      const parts = timecode.split('/');
      if (parts.length === 2) {
        return parseInt(parts[0]) / parseInt(parts[1]);
      }
      return parseFloat(timecode) || 0;
    }

    formatFCPTimecode(seconds) {
      // Simplified timecode formatting
      return `${Math.floor(seconds * 30)}/30s`; // Assume 30fps
    }

    parseEDLTimecode(timecode) {
      if (!timecode) return 0;
      // Parse HH:MM:SS:FF format
      const parts = timecode.split(':');
      if (parts.length === 4) {
        const hours = parseInt(parts[0]);
        const minutes = parseInt(parts[1]);
        const seconds = parseInt(parts[2]);
        const frames = parseInt(parts[3]);

        // Assume 30fps
        return ((hours * 3600 + minutes * 60 + seconds) * 30 + frames) / 30;
      }
      return 0;
    }

    formatEDLTimecode(seconds) {
      // Format as HH:MM:SS:FF (assume 30fps)
      const totalFrames = Math.floor(seconds * 30);
      const hours = Math.floor(totalFrames / (30 * 3600));
      const minutes = Math.floor((totalFrames % (30 * 3600)) / (30 * 60));
      const secs = Math.floor((totalFrames % (30 * 60)) / 30);
      const frames = totalFrames % 30;

      return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}:${String(frames).padStart(2, '0')}`;
    }

    collectWarnings() {
      // Collect any warnings generated during import/export
      return []; // Placeholder
    }

    extractMetadata(data, format) {
      // Extract metadata from imported file
      return {
        format: format,
        importedAt: new Date().toISOString(),
        originalSize: data.length
      };
    }

    // Validation methods
    validateProject(project) {
      const errors = [];

      if (!project.name) {
        errors.push('Project name is required');
      }

      if (!project.timeline?.sequences?.length) {
        errors.push('Project must have at least one sequence');
      }

      return {
        valid: errors.length === 0,
        errors: errors
      };
    }

    // Batch operations
    async batchImport(files, options = {}) {
      const results = [];

      for (const file of files) {
        const format = this.detectFormat(file.name);
        if (this.canImport(format)) {
          const result = await this.importProject(file, format, options);
          results.push({
            file: file.name,
            ...result
          });
        } else {
          results.push({
            file: file.name,
            success: false,
            error: `Unsupported format: ${format}`
          });
        }
      }

      return results;
    }

    async batchExport(projects, format, options = {}) {
      const results = [];

      for (const project of projects) {
        const result = await this.exportProject(project, format, options);
        results.push({
          project: project.name,
          ...result
        });
      }

      return results;
    }

    detectFormat(filename) {
      const extension = filename.toLowerCase().split('.').pop();

      for (const [format, info] of Object.entries(SUPPORTED_FORMATS)) {
        if (info.extension === `.${extension}`) {
          return format;
        }
      }

      return 'unknown';
    }

    // Cleanup
    destroy() {
      this.importers.clear();
      this.exporters.clear();
      this.conversionRules.clear();
      this.metadataHandlers.clear();
    }
  }

  // Export to global scope
  global.ProjectCompatibilityManager = ProjectCompatibilityManager;
  global.SUPPORTED_PROJECT_FORMATS = SUPPORTED_FORMATS;

  console.log('Project compatibility system registered');

})(typeof window !== 'undefined' ? window : globalThis);
