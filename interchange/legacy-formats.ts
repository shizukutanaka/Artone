/**
 * EDL / FCPXML / AAF 互換層
 *
 * 業界標準フォーマット往復編集:
 * - EDL (CMX 3600): カラー業務の基本
 * - FCPXML: Final Cut Pro 7/X
 * - AAF: Avid Media Composer (XML 経由の簡易対応)
 */

import type { ArtoneTimeline, ArtoneClip } from './otio';
import { pad, escapeXML } from '../app/utils';

// === タイムコード変換 ===

export class TimecodeUtil {
  static framesToTC(frames: number, fps: number, dropFrame = false): string {
    if (dropFrame && (fps === 29.97 || fps === 59.94)) {
      return this.framesToDropFrameTC(frames, fps);
    }
    const f = Math.floor(frames);
    const fpsInt = Math.round(fps);
    const hh = Math.floor(f / (fpsInt * 3600));
    const mm = Math.floor((f / (fpsInt * 60)) % 60);
    const ss = Math.floor((f / fpsInt) % 60);
    const ff = f % fpsInt;
    return `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
  }

  static tcToFrames(tc: string, fps: number): number {
    const dropFrame = tc.includes(';');
    const parts = tc.split(/[:;]/).map(Number);
    if (parts.length !== 4) throw new Error(`Invalid timecode: ${tc}`);
    const [hh, mm, ss, ff] = parts;
    const fpsInt = Math.round(fps);

    if (dropFrame && (fps === 29.97 || fps === 59.94)) {
      const dropFrames = fps === 29.97 ? 2 : 4;
      const totalMin = hh * 60 + mm;
      return (
        hh * 3600 * fpsInt +
        mm * 60 * fpsInt +
        ss * fpsInt +
        ff -
        dropFrames * (totalMin - Math.floor(totalMin / 10))
      );
    }
    return hh * 3600 * fpsInt + mm * 60 * fpsInt + ss * fpsInt + ff;
  }

  private static framesToDropFrameTC(frames: number, fps: number): string {
    const dropFrames = fps === 29.97 ? 2 : 4;
    const framesPerHour = Math.round(fps * 3600);
    const framesPer24Hours = framesPerHour * 24;
    const framesPer10Min = Math.round(fps * 600);
    const framesPerMin = Math.round(fps * 60);

    let f = frames % framesPer24Hours;
    const d = Math.floor(f / framesPer10Min);
    const m = f % framesPer10Min;
    if (m > dropFrames) {
      f += dropFrames * 9 * d + dropFrames * Math.floor((m - dropFrames) / framesPerMin);
    } else {
      f += dropFrames * 9 * d;
    }

    const fpsInt = Math.round(fps);
    const ff = f % fpsInt;
    const ss = Math.floor(f / fpsInt) % 60;
    const mm = Math.floor(f / (fpsInt * 60)) % 60;
    const hh = Math.floor(f / (fpsInt * 3600));
    return `${pad(hh)}:${pad(mm)}:${pad(ss)};${pad(ff)}`;
  }
}

function pad3(n: number): string {
  return n.toString().padStart(3, '0');
}

// === EDL (CMX 3600) ===

export class EDLExporter {
  private reelCounter: Map<string, number> = new Map();

  export(tl: ArtoneTimeline, options: { title?: string; dropFrame?: boolean; includeAudio?: boolean } = {}): string {
    this.reelCounter.clear();
    const lines: string[] = [];
    const fcm = options.dropFrame ? 'DROP FRAME' : 'NON-DROP FRAME';
    lines.push(`TITLE: ${options.title ?? tl.name}`);
    lines.push(`FCM: ${fcm}`);
    lines.push('');

    let editNum = 1;
    const includeAudio = options.includeAudio ?? true;
    const sources: Array<{ clip: ArtoneClip; kind: 'video' | 'audio' }> = [];

    for (const t of tl.videoTracks) {
      for (const c of t.clips) sources.push({ clip: c, kind: 'video' });
    }
    if (includeAudio) {
      for (const t of tl.audioTracks) {
        for (const c of t.clips) sources.push({ clip: c, kind: 'audio' });
      }
    }
    sources.sort((a, b) => a.clip.startFrame - b.clip.startFrame);

    for (const { clip, kind } of sources) {
      const reel = this.reelName(clip.name);
      const trackType = kind === 'video' ? 'V' : 'A';
      const srcIn = TimecodeUtil.framesToTC(clip.sourceInFrame, tl.fps, options.dropFrame);
      const srcOut = TimecodeUtil.framesToTC(
        clip.sourceInFrame + clip.durationFrames,
        tl.fps,
        options.dropFrame
      );
      const recIn = TimecodeUtil.framesToTC(clip.startFrame, tl.fps, options.dropFrame);
      const recOut = TimecodeUtil.framesToTC(
        clip.startFrame + clip.durationFrames,
        tl.fps,
        options.dropFrame
      );

      lines.push(
        `${pad3(editNum)}  ${reel.padEnd(8)} ${trackType}     C        ${srcIn} ${srcOut} ${recIn} ${recOut}`
      );
      lines.push(`* FROM CLIP NAME: ${clip.name}`);
      lines.push('');
      editNum++;
    }
    return lines.join('\n');
  }

  /**
   * Reel 名生成。同名クリップで衝突しないよう連番 suffix。
   * EDL の reel 名は 8 文字制限。
   */
  private reelName(clipName: string): string {
    const base = clipName.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8) || 'AX';
    const count = this.reelCounter.get(base) ?? 0;
    this.reelCounter.set(base, count + 1);

    if (count === 0) return base;
    const suffix = String(count + 1);
    const cut = base.slice(0, Math.max(1, 8 - suffix.length));
    return cut + suffix;
  }
}

// === FCPXML (Final Cut Pro X 1.10) ===

export class FCPXMLExporter {
  export(tl: ArtoneTimeline): string {
    const ratio = `${Math.round(tl.fps)}`;

    // sequence duration = 全videoTrackの最終フレーム最大値
    let totalFrames = 0;
    for (const track of tl.videoTracks) {
      for (const clip of track.clips) {
        const end = clip.startFrame + clip.durationFrames;
        if (end > totalFrames) totalFrames = end;
      }
    }
    for (const track of tl.audioTracks) {
      for (const clip of track.clips) {
        const end = clip.startFrame + clip.durationFrames;
        if (end > totalFrames) totalFrames = end;
      }
    }

    const xml: string[] = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<!DOCTYPE fcpxml>',
      '<fcpxml version="1.10">',
      '  <resources>',
      `    <format id="r1" name="FFVideoFormat${ratio}p" frameDuration="1/${ratio}s" width="1920" height="1080"/>`,
    ];

    // メディア参照
    const mediaMap = new Map<string, string>();
    let assetId = 2;
    const allClips = [...tl.videoTracks, ...tl.audioTracks].flatMap((t) => t.clips);
    for (const c of allClips) {
      if (!mediaMap.has(c.mediaUrl)) {
        const id = `r${assetId++}`;
        mediaMap.set(c.mediaUrl, id);
        xml.push(
          `    <asset id="${id}" name="${escapeXML(c.name)}" src="${escapeXML(c.mediaUrl)}" hasVideo="1" hasAudio="1" format="r1"/>`
        );
      }
    }
    xml.push('  </resources>');

    xml.push(`  <library>`);
    xml.push(`    <event name="${escapeXML(tl.name)}">`);
    xml.push(`      <project name="${escapeXML(tl.name)}">`);
    xml.push(`        <sequence format="r1" duration="${totalFrames}/${ratio}s">`);
    xml.push(`          <spine>`);

    for (const track of tl.videoTracks) {
      for (const clip of track.clips.sort((a, b) => a.startFrame - b.startFrame)) {
        const refId = mediaMap.get(clip.mediaUrl) ?? 'r2';
        const offset = `${clip.startFrame}/${ratio}s`;
        const start = `${clip.sourceInFrame}/${ratio}s`;
        const duration = `${clip.durationFrames}/${ratio}s`;
        xml.push(
          `            <clip name="${escapeXML(clip.name)}" offset="${offset}" start="${start}" duration="${duration}" ref="${refId}"/>`
        );
      }
    }

    xml.push(`          </spine>`);
    xml.push(`        </sequence>`);
    xml.push(`      </project>`);
    xml.push(`    </event>`);
    xml.push(`  </library>`);
    xml.push(`</fcpxml>`);

    return xml.join('\n');
  }
}

// === ファクトリ ===

export const interchange = {
  edl: () => new EDLExporter(),
  fcpxml: () => new FCPXMLExporter(),
  timecode: TimecodeUtil,
};
