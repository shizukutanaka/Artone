/**
 * Artone v3 — Caption System
 * 
 * 字幕/キャプションシステム
 * - SRT/VTT/ASS 読み込み/書き出し
 * - スタイリング
 * - 焼き込み
 * - 自動同期
 * - 多言語対応
 * 
 * @version 1.0.0
 */

// ============================================================
// Types
// ============================================================

export interface Caption {
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  style: CaptionStyle;
  position: CaptionPosition;
  layer: number;
  speakerId?: string;
}

export interface CaptionStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: 'normal' | 'italic';
  color: string;
  backgroundColor: string;
  backgroundOpacity: number;
  outlineColor: string;
  outlineWidth: number;
  shadowColor: string;
  shadowBlur: number;
  shadowOffsetX: number;
  shadowOffsetY: number;
  letterSpacing: number;
  lineHeight: number;
}

export interface CaptionPosition {
  x: number;           // 0-100%
  y: number;           // 0-100%
  align: 'left' | 'center' | 'right';
  verticalAlign: 'top' | 'middle' | 'bottom';
  maxWidth: number;    // 0-100%
}

export interface CaptionTrack {
  id: string;
  name: string;
  language: string;
  captions: Caption[];
  default: boolean;
  forced: boolean;
}

export interface CaptionPreset {
  id: string;
  name: string;
  style: CaptionStyle;
  position: CaptionPosition;
}

export type CaptionFormat = 'srt' | 'vtt' | 'ass' | 'ttml' | 'dfxp';

// ============================================================
// Default Styles
// ============================================================

const DEFAULT_STYLE: CaptionStyle = {
  fontFamily: 'Arial',
  fontSize: 48,
  fontWeight: 400,
  fontStyle: 'normal',
  color: '#ffffff',
  backgroundColor: '#000000',
  backgroundOpacity: 0.75,
  outlineColor: '#000000',
  outlineWidth: 2,
  shadowColor: '#000000',
  shadowBlur: 4,
  shadowOffsetX: 2,
  shadowOffsetY: 2,
  letterSpacing: 0,
  lineHeight: 1.4
};

const DEFAULT_POSITION: CaptionPosition = {
  x: 50,
  y: 90,
  align: 'center',
  verticalAlign: 'bottom',
  maxWidth: 80
};

// ============================================================
// Style Presets
// ============================================================

export const CAPTION_PRESETS: CaptionPreset[] = [
  {
    id: 'default',
    name: 'Default',
    style: DEFAULT_STYLE,
    position: DEFAULT_POSITION
  },
  {
    id: 'netflix',
    name: 'Netflix Style',
    style: {
      ...DEFAULT_STYLE,
      fontFamily: 'Netflix Sans',
      fontSize: 42,
      backgroundColor: 'transparent',
      backgroundOpacity: 0,
      outlineWidth: 3
    },
    position: DEFAULT_POSITION
  },
  {
    id: 'youtube',
    name: 'YouTube Style',
    style: {
      ...DEFAULT_STYLE,
      fontFamily: 'Roboto',
      fontSize: 36,
      backgroundColor: '#000000',
      backgroundOpacity: 0.8,
      outlineWidth: 0
    },
    position: { ...DEFAULT_POSITION, y: 85 }
  },
  {
    id: 'karaoke',
    name: 'Karaoke',
    style: {
      ...DEFAULT_STYLE,
      fontSize: 56,
      color: '#ffff00',
      outlineColor: '#ff0000',
      outlineWidth: 4,
      backgroundColor: 'transparent',
      backgroundOpacity: 0
    },
    position: { ...DEFAULT_POSITION, y: 80 }
  },
  {
    id: 'news',
    name: 'News Ticker',
    style: {
      ...DEFAULT_STYLE,
      fontFamily: 'Arial',
      fontSize: 32,
      fontWeight: 700,
      backgroundColor: '#0066cc',
      backgroundOpacity: 1,
      outlineWidth: 0
    },
    position: { x: 50, y: 95, align: 'center', verticalAlign: 'bottom', maxWidth: 100 }
  }
];

// ============================================================
// Caption Manager
// ============================================================

export class CaptionManager {
  private tracks: Map<string, CaptionTrack> = new Map();
  private activeTrackId: string | null = null;
  private listeners: Set<() => void> = new Set();

  // ============================================================
  // Track Management
  // ============================================================

  createTrack(name: string, language = 'ja'): CaptionTrack {
    const track: CaptionTrack = {
      id: crypto.randomUUID(),
      name,
      language,
      captions: [],
      default: this.tracks.size === 0,
      forced: false
    };

    this.tracks.set(track.id, track);
    
    if (!this.activeTrackId) {
      this.activeTrackId = track.id;
    }

    this.notify();
    return track;
  }

  deleteTrack(trackId: string): void {
    this.tracks.delete(trackId);
    
    if (this.activeTrackId === trackId) {
      this.activeTrackId = this.tracks.size > 0
        ? this.tracks.keys().next().value ?? null
        : null;
    }

    this.notify();
  }

  setActiveTrack(trackId: string): void {
    if (this.tracks.has(trackId)) {
      this.activeTrackId = trackId;
      this.notify();
    }
  }

  getActiveTrack(): CaptionTrack | null {
    return this.activeTrackId ? this.tracks.get(this.activeTrackId) || null : null;
  }

  getAllTracks(): CaptionTrack[] {
    return Array.from(this.tracks.values());
  }

  // ============================================================
  // Caption Operations
  // ============================================================

  addCaption(
    trackId: string,
    startTime: number,
    endTime: number,
    text: string,
    style?: Partial<CaptionStyle>,
    position?: Partial<CaptionPosition>
  ): Caption | null {
    const track = this.tracks.get(trackId);
    if (!track) return null;

    const caption: Caption = {
      id: crypto.randomUUID(),
      startTime,
      endTime,
      text,
      style: { ...DEFAULT_STYLE, ...style },
      position: { ...DEFAULT_POSITION, ...position },
      layer: 0
    };

    track.captions.push(caption);
    track.captions.sort((a, b) => a.startTime - b.startTime);

    this.notify();
    return caption;
  }

  updateCaption(trackId: string, captionId: string, updates: Partial<Caption>): void {
    const track = this.tracks.get(trackId);
    if (!track) return;

    const caption = track.captions.find(c => c.id === captionId);
    if (caption) {
      Object.assign(caption, updates);
      track.captions.sort((a, b) => a.startTime - b.startTime);
      this.notify();
    }
  }

  deleteCaption(trackId: string, captionId: string): void {
    const track = this.tracks.get(trackId);
    if (!track) return;

    track.captions = track.captions.filter(c => c.id !== captionId);
    this.notify();
  }

  getCaptionsAtTime(trackId: string, time: number): Caption[] {
    const track = this.tracks.get(trackId);
    if (!track) return [];

    return track.captions.filter(c => time >= c.startTime && time < c.endTime);
  }

  // ============================================================
  // Import/Export
  // ============================================================

  /**
   * ASR (音声認識) のセグメントから自動字幕トラックを生成する。
   * `ai-effects-engine` の TranscriptionSegment と構造的に互換 (start/end/text)。
   * @param cues - { start, end, text } の配列 (秒)
   * @param trackId - 既存トラックに追記する場合に指定。未指定なら新規作成。
   */
  importFromTranscription(
    cues: Array<{ start: number; end: number; text: string }>,
    trackId?: string
  ): CaptionTrack {
    const track = trackId
      ? this.tracks.get(trackId) || this.createTrack('Auto Captions')
      : this.createTrack('Auto Captions');

    for (const cue of cues) {
      const text = cue.text.trim();
      if (text.length === 0) continue;
      this.addCaption(track.id, cue.start, cue.end, text);
    }

    track.captions.sort((a, b) => a.startTime - b.startTime);
    this.notify();
    return track;
  }

  importSRT(content: string, trackId?: string): CaptionTrack {
    const track = trackId 
      ? this.tracks.get(trackId) || this.createTrack('Imported')
      : this.createTrack('Imported SRT');

    const blocks = content.trim().split(/\n\n+/);

    for (const block of blocks) {
      const lines = block.split('\n');
      if (lines.length < 3) continue;

      // Parse timecode line
      const timeLine = lines[1];
      const match = timeLine.match(/(\d{2}):(\d{2}):(\d{2}),(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2}),(\d{3})/);
      if (!match) continue;

      const startTime = this.timeToSeconds(match[1], match[2], match[3], match[4]);
      const endTime = this.timeToSeconds(match[5], match[6], match[7], match[8]);
      const text = lines.slice(2).join('\n');

      this.addCaption(track.id, startTime, endTime, text);
    }

    return track;
  }

  importVTT(content: string, trackId?: string): CaptionTrack {
    const track = trackId 
      ? this.tracks.get(trackId) || this.createTrack('Imported')
      : this.createTrack('Imported VTT');

    // Remove WEBVTT header
    const lines = content.replace(/^WEBVTT.*\n\n?/, '').trim().split(/\n\n+/);

    for (const block of lines) {
      const blockLines = block.split('\n');
      
      // Find timecode line
      let timeLineIndex = 0;
      for (let i = 0; i < blockLines.length; i++) {
        if (blockLines[i].includes('-->')) {
          timeLineIndex = i;
          break;
        }
      }

      const timeLine = blockLines[timeLineIndex];
      const match = timeLine.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
      if (!match) continue;

      const startTime = this.timeToSeconds(match[1], match[2], match[3], match[4]);
      const endTime = this.timeToSeconds(match[5], match[6], match[7], match[8]);
      const text = blockLines.slice(timeLineIndex + 1).join('\n').replace(/<[^>]+>/g, '');

      this.addCaption(track.id, startTime, endTime, text);
    }

    return track;
  }

  importASS(content: string, trackId?: string): CaptionTrack {
    const track = trackId 
      ? this.tracks.get(trackId) || this.createTrack('Imported')
      : this.createTrack('Imported ASS');

    const lines = content.split('\n');
    let inEvents = false;

    for (const line of lines) {
      if (line.startsWith('[Events]')) {
        inEvents = true;
        continue;
      }

      if (inEvents && line.startsWith('Dialogue:')) {
        const parts = line.substring(10).split(',');
        if (parts.length < 10) continue;

        const startTime = this.assTimeToSeconds(parts[1].trim());
        const endTime = this.assTimeToSeconds(parts[2].trim());
        const text = parts.slice(9).join(',').replace(/\\N/g, '\n').replace(/\{[^}]+\}/g, '');

        this.addCaption(track.id, startTime, endTime, text);
      }
    }

    return track;
  }

  exportSRT(trackId: string): string {
    const track = this.tracks.get(trackId);
    if (!track) return '';

    const lines: string[] = [];

    track.captions.forEach((caption, index) => {
      lines.push(String(index + 1));
      lines.push(`${this.secondsToSRTTime(caption.startTime)} --> ${this.secondsToSRTTime(caption.endTime)}`);
      lines.push(caption.text);
      lines.push('');
    });

    return lines.join('\n');
  }

  exportVTT(trackId: string): string {
    const track = this.tracks.get(trackId);
    if (!track) return '';

    const lines: string[] = ['WEBVTT', ''];

    for (const caption of track.captions) {
      lines.push(`${this.secondsToVTTTime(caption.startTime)} --> ${this.secondsToVTTTime(caption.endTime)}`);
      lines.push(caption.text);
      lines.push('');
    }

    return lines.join('\n');
  }

  exportASS(trackId: string): string {
    const track = this.tracks.get(trackId);
    if (!track) return '';

    const header = `[Script Info]
Title: Artone Export
ScriptType: v4.00+
WrapStyle: 0
PlayResX: 1920
PlayResY: 1080

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H80000000,0,0,0,0,100,100,0,0,1,2,1,2,10,10,10,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

    const events = track.captions.map(c => {
      const text = c.text.replace(/\n/g, '\\N');
      return `Dialogue: 0,${this.secondsToASSTime(c.startTime)},${this.secondsToASSTime(c.endTime)},Default,,0,0,0,,${text}`;
    });

    return header + events.join('\n');
  }

  // ============================================================
  // Time Utilities
  // ============================================================

  private timeToSeconds(h: string, m: string, s: string, ms: string): number {
    return parseInt(h) * 3600 + parseInt(m) * 60 + parseInt(s) + parseInt(ms) / 1000;
  }

  private assTimeToSeconds(time: string): number {
    const match = time.match(/(\d+):(\d{2}):(\d{2})\.(\d{2})/);
    if (!match) return 0;
    return parseInt(match[1]) * 3600 + parseInt(match[2]) * 60 + parseInt(match[3]) + parseInt(match[4]) / 100;
  }

  private secondsToSRTTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  private secondsToVTTTime(seconds: number): string {
    return this.secondsToSRTTime(seconds).replace(',', '.');
  }

  private secondsToASSTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const cs = Math.floor((seconds % 1) * 100);
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
  }

  // ============================================================
  // Rendering
  // ============================================================

  renderCaption(
    ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    caption: Caption,
    width: number,
    height: number
  ): void {
    const { style, position, text } = caption;

    // Calculate position
    const x = (position.x / 100) * width;
    const y = (position.y / 100) * height;
    const maxWidth = (position.maxWidth / 100) * width;

    // Setup font
    ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px "${style.fontFamily}"`;
    ctx.textAlign = position.align;
    ctx.textBaseline = position.verticalAlign === 'top' ? 'top' : position.verticalAlign === 'bottom' ? 'bottom' : 'middle';

    // Word wrap
    const lines = this.wrapText(ctx, text, maxWidth);

    // Calculate background bounds
    const lineHeight = style.fontSize * style.lineHeight;
    const textHeight = lines.length * lineHeight;
    
    let bgY = y;
    if (position.verticalAlign === 'bottom') {
      bgY = y - textHeight;
    } else if (position.verticalAlign === 'middle') {
      bgY = y - textHeight / 2;
    }

    // Draw background
    if (style.backgroundOpacity > 0) {
      const padding = 10;
      const maxLineWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
      
      let bgX = x - padding;
      if (position.align === 'center') {
        bgX = x - maxLineWidth / 2 - padding;
      } else if (position.align === 'right') {
        bgX = x - maxLineWidth - padding;
      }

      ctx.fillStyle = style.backgroundColor;
      ctx.globalAlpha = style.backgroundOpacity;
      ctx.fillRect(bgX, bgY - padding, maxLineWidth + padding * 2, textHeight + padding * 2);
      ctx.globalAlpha = 1;
    }

    // Draw text
    for (let i = 0; i < lines.length; i++) {
      const lineY = bgY + i * lineHeight + lineHeight / 2;
      
      // Shadow
      if (style.shadowBlur > 0) {
        ctx.shadowColor = style.shadowColor;
        ctx.shadowBlur = style.shadowBlur;
        ctx.shadowOffsetX = style.shadowOffsetX;
        ctx.shadowOffsetY = style.shadowOffsetY;
      }

      // Outline
      if (style.outlineWidth > 0) {
        ctx.strokeStyle = style.outlineColor;
        ctx.lineWidth = style.outlineWidth * 2;
        ctx.lineJoin = 'round';
        ctx.strokeText(lines[i], x, lineY);
      }

      // Fill
      ctx.fillStyle = style.color;
      ctx.shadowBlur = 0;
      ctx.fillText(lines[i], x, lineY);
    }
  }

  private wrapText(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const paragraphs = text.split('\n');
    const lines: string[] = [];

    for (const para of paragraphs) {
      const words = para.split(' ');
      let currentLine = '';

      for (const word of words) {
        const testLine = currentLine ? `${currentLine} ${word}` : word;
        const metrics = ctx.measureText(testLine);

        if (metrics.width > maxWidth && currentLine) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = testLine;
        }
      }

      if (currentLine) {
        lines.push(currentLine);
      }
    }

    return lines;
  }

  // ============================================================
  // Burn-in
  // ============================================================

  async burnInCaptions(
    videoFrame: VideoFrame,
    trackId: string,
    time: number
  ): Promise<VideoFrame> {
    const captions = this.getCaptionsAtTime(trackId, time);
    if (captions.length === 0) return videoFrame;

    const width = videoFrame.displayWidth;
    const height = videoFrame.displayHeight;

    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d')!;

    // Draw video frame
    ctx.drawImage(videoFrame, 0, 0);

    // Draw captions
    for (const caption of captions) {
      this.renderCaption(ctx, caption, width, height);
    }

    // Create new frame
    const newFrame = new VideoFrame(canvas, {
      timestamp: videoFrame.timestamp,
      duration: videoFrame.duration || undefined
    });

    return newFrame;
  }

  // ============================================================
  // Listeners
  // ============================================================

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    for (const listener of this.listeners) {
      listener();
    }
  }
}

export default CaptionManager;
