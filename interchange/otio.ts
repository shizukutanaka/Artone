/**
 * OpenTimelineIO (.otio) 互換層
 *
 * 10年運用のための業界標準互換性。
 * Pixar 開発、DaVinci Resolve / Premiere / FCP / Avid 採用。
 *
 * 仕様: https://opentimeline.io
 * スキーマ: SchemaDef-1
 *
 * インポート/エクスポートで他 NLE と往復編集可能。
 */

// === OTIO スキーマ型定義 ===

interface OTIORationalTime {
  OTIO_SCHEMA: 'RationalTime.1';
  rate: number;
  value: number;
}

interface OTIOTimeRange {
  OTIO_SCHEMA: 'TimeRange.1';
  duration: OTIORationalTime;
  start_time: OTIORationalTime;
}

interface OTIOMediaReference {
  OTIO_SCHEMA: 'ExternalReference.1' | 'MissingReference.1' | 'GeneratorReference.1';
  available_range?: OTIOTimeRange;
  metadata?: Record<string, unknown>;
  name?: string;
  target_url?: string;
}

interface OTIOEffect {
  OTIO_SCHEMA: 'Effect.1' | 'TimeEffect.1' | 'LinearTimeWarp.1';
  effect_name: string;
  metadata?: Record<string, unknown>;
  name?: string;
}

interface OTIOMarker {
  OTIO_SCHEMA: 'Marker.1' | 'Marker.2';
  color: 'PINK' | 'RED' | 'ORANGE' | 'YELLOW' | 'GREEN' | 'CYAN' | 'BLUE' | 'PURPLE' | 'MAGENTA' | 'BLACK' | 'WHITE';
  marked_range: OTIOTimeRange;
  metadata?: Record<string, unknown>;
  name?: string;
  comment?: string;
}

interface OTIOClip {
  OTIO_SCHEMA: 'Clip.1' | 'Clip.2';
  effects: OTIOEffect[];
  markers: OTIOMarker[];
  media_reference: OTIOMediaReference;
  metadata?: Record<string, unknown>;
  name: string;
  source_range: OTIOTimeRange;
  enabled?: boolean;
}

interface OTIOGap {
  OTIO_SCHEMA: 'Gap.1';
  effects: OTIOEffect[];
  markers: OTIOMarker[];
  metadata?: Record<string, unknown>;
  name?: string;
  source_range: OTIOTimeRange;
}

interface OTIOTransition {
  OTIO_SCHEMA: 'Transition.1';
  metadata?: Record<string, unknown>;
  name?: string;
  transition_type: 'SMPTE_Dissolve' | string;
  parameters?: Record<string, unknown>;
  in_offset: OTIORationalTime;
  out_offset: OTIORationalTime;
}

type OTIOTrackChild = OTIOClip | OTIOGap | OTIOTransition;

interface OTIOTrack {
  OTIO_SCHEMA: 'Track.1';
  children: OTIOTrackChild[];
  effects: OTIOEffect[];
  kind: 'Video' | 'Audio';
  markers: OTIOMarker[];
  metadata?: Record<string, unknown>;
  name?: string;
  source_range?: OTIOTimeRange | null;
}

interface OTIOStack {
  OTIO_SCHEMA: 'Stack.1';
  children: OTIOTrack[];
  effects: OTIOEffect[];
  markers: OTIOMarker[];
  metadata?: Record<string, unknown>;
  name?: string;
  source_range?: OTIOTimeRange | null;
}

interface OTIOTimeline {
  OTIO_SCHEMA: 'Timeline.1';
  global_start_time?: OTIORationalTime | null;
  metadata?: Record<string, unknown>;
  name: string;
  tracks: OTIOStack;
}

// === 内部型 (Artone 側 — 既存実装と整合) ===

export interface ArtoneTimeline {
  name: string;
  fps: number;
  videoTracks: ArtoneTrack[];
  audioTracks: ArtoneTrack[];
  markers: ArtoneMarker[];
}

export interface ArtoneTrack {
  name: string;
  kind: 'video' | 'audio';
  clips: ArtoneClip[];
  enabled: boolean;
}

export interface ArtoneClip {
  id: string;
  name: string;
  startFrame: number;
  durationFrames: number;
  sourceInFrame: number;
  mediaUrl: string;
  effects: ArtoneEffect[];
  markers: ArtoneMarker[];
  enabled: boolean;
  /** 前のクリップとのトランジション (in側) */
  transitionIn?: ArtoneTransition;
  /** 次のクリップとのトランジション (out側) */
  transitionOut?: ArtoneTransition;
}

export interface ArtoneTransition {
  type: 'dissolve' | 'fade' | 'wipe' | string;
  /** 入り方 (フレーム) — クリップ前のオーバーラップ */
  inFrames: number;
  /** 出方 (フレーム) — クリップ後のオーバーラップ */
  outFrames: number;
  parameters?: Record<string, unknown>;
}

export interface ArtoneEffect {
  type: string;
  name: string;
  params: Record<string, unknown>;
}

export interface ArtoneMarker {
  frame: number;
  duration: number;
  color: string;
  name: string;
  comment?: string;
}

// === 変換ロジック ===

const COLOR_MAP_ARTONE_TO_OTIO: Record<string, OTIOMarker['color']> = {
  red: 'RED',
  orange: 'ORANGE',
  yellow: 'YELLOW',
  green: 'GREEN',
  cyan: 'CYAN',
  blue: 'BLUE',
  purple: 'PURPLE',
  magenta: 'MAGENTA',
  pink: 'PINK',
  black: 'BLACK',
  white: 'WHITE',
};

const COLOR_MAP_OTIO_TO_ARTONE: Record<string, string> = Object.fromEntries(
  Object.entries(COLOR_MAP_ARTONE_TO_OTIO).map(([k, v]) => [v, k])
);

function rationalTime(frames: number, fps: number): OTIORationalTime {
  return { OTIO_SCHEMA: 'RationalTime.1', rate: fps, value: frames };
}

function timeRange(startFrame: number, durationFrames: number, fps: number): OTIOTimeRange {
  return {
    OTIO_SCHEMA: 'TimeRange.1',
    start_time: rationalTime(startFrame, fps),
    duration: rationalTime(durationFrames, fps),
  };
}

function fromRationalTime(rt: OTIORationalTime, targetFps: number): number {
  // レート差を吸収。targetFps に揃える
  if (rt.rate === targetFps) return Math.round(rt.value);
  // 整数演算優先で誤差軽減: (value * targetFps) / rate
  return Math.round((rt.value * targetFps) / rt.rate);
}

// === エクスポート: Artone → OTIO ===

export class OTIOExporter {
  export(tl: ArtoneTimeline): OTIOTimeline {
    const stack: OTIOStack = {
      OTIO_SCHEMA: 'Stack.1',
      children: [
        ...tl.videoTracks.map((t) => this.toOTIOTrack(t, tl.fps)),
        ...tl.audioTracks.map((t) => this.toOTIOTrack(t, tl.fps)),
      ],
      effects: [],
      markers: tl.markers.map((m) => this.toOTIOMarker(m, tl.fps)),
      name: 'Stack',
    };

    return {
      OTIO_SCHEMA: 'Timeline.1',
      global_start_time: rationalTime(0, tl.fps),
      metadata: {
        artone: { version: '3.0.0', exported: new Date().toISOString() },
      },
      name: tl.name,
      tracks: stack,
    };
  }

  exportToString(tl: ArtoneTimeline, pretty = true): string {
    return JSON.stringify(this.export(tl), null, pretty ? 2 : 0);
  }

  private toOTIOTrack(track: ArtoneTrack, fps: number): OTIOTrack {
    // ギャップ補完: クリップ間の空白を Gap で埋める
    // トランジション: 隣接クリップ間に Transition ブロック挿入
    const sortedClips = [...track.clips].sort((a, b) => a.startFrame - b.startFrame);
    const children: OTIOTrackChild[] = [];
    let cursor = 0;

    for (let i = 0; i < sortedClips.length; i++) {
      const clip = sortedClips[i];
      if (clip.startFrame > cursor) {
        children.push(this.makeGap(clip.startFrame - cursor, fps));
      }
      children.push(this.toOTIOClip(clip, fps));
      cursor = clip.startFrame + clip.durationFrames;

      // 次クリップとのトランジション
      const next = sortedClips[i + 1];
      if (next && clip.transitionOut) {
        children.push(this.toOTIOTransition(clip.transitionOut, fps));
      }
    }

    return {
      OTIO_SCHEMA: 'Track.1',
      children,
      effects: [],
      kind: track.kind === 'video' ? 'Video' : 'Audio',
      markers: [],
      name: track.name,
      source_range: null,
    };
  }

  private toOTIOTransition(tr: ArtoneTransition, fps: number): OTIOTransition {
    const typeMap: Record<string, string> = {
      dissolve: 'SMPTE_Dissolve',
      fade: 'SMPTE_Dissolve',
      wipe: 'SMPTE_Wipe',
    };
    return {
      OTIO_SCHEMA: 'Transition.1',
      transition_type: typeMap[tr.type] ?? tr.type,
      in_offset: rationalTime(tr.inFrames, fps),
      out_offset: rationalTime(tr.outFrames, fps),
      parameters: tr.parameters,
      metadata: { artone: { type: tr.type } },
    };
  }

  private toOTIOClip(clip: ArtoneClip, fps: number): OTIOClip {
    return {
      OTIO_SCHEMA: 'Clip.2',
      effects: clip.effects.map((e) => this.toOTIOEffect(e)),
      markers: clip.markers.map((m) => this.toOTIOMarker(m, fps)),
      media_reference: {
        OTIO_SCHEMA: 'ExternalReference.1',
        target_url: clip.mediaUrl,
        name: clip.name,
      },
      metadata: { artone: { clipId: clip.id } },
      name: clip.name,
      source_range: timeRange(clip.sourceInFrame, clip.durationFrames, fps),
      enabled: clip.enabled,
    };
  }

  private makeGap(durationFrames: number, fps: number): OTIOGap {
    return {
      OTIO_SCHEMA: 'Gap.1',
      effects: [],
      markers: [],
      source_range: timeRange(0, durationFrames, fps),
    };
  }

  private toOTIOEffect(eff: ArtoneEffect): OTIOEffect {
    return {
      OTIO_SCHEMA: 'Effect.1',
      effect_name: eff.type,
      name: eff.name,
      metadata: { artone: { params: eff.params } },
    };
  }

  private toOTIOMarker(m: ArtoneMarker, fps: number): OTIOMarker {
    return {
      OTIO_SCHEMA: 'Marker.2',
      color: COLOR_MAP_ARTONE_TO_OTIO[m.color.toLowerCase()] ?? 'RED',
      marked_range: timeRange(m.frame, m.duration, fps),
      name: m.name,
      comment: m.comment,
    };
  }
}

// === インポート: OTIO → Artone ===

export class OTIOImporter {
  import(otio: OTIOTimeline, targetFps?: number): ArtoneTimeline {
    const fps = targetFps ?? otio.global_start_time?.rate ?? 30;
    const stack = otio.tracks;

    const videoTracks: ArtoneTrack[] = [];
    const audioTracks: ArtoneTrack[] = [];

    for (const track of stack.children) {
      const artoneTrack = this.fromOTIOTrack(track, fps);
      if (track.kind === 'Video') videoTracks.push(artoneTrack);
      else audioTracks.push(artoneTrack);
    }

    return {
      name: otio.name,
      fps,
      videoTracks,
      audioTracks,
      markers: stack.markers.map((m) => this.fromOTIOMarker(m, fps)),
    };
  }

  importFromString(json: string, targetFps?: number): ArtoneTimeline {
    let otio: OTIOTimeline;
    try {
      otio = JSON.parse(json) as OTIOTimeline;
    } catch (err) {
      throw new Error(`Invalid OTIO JSON: ${(err as Error).message}`);
    }
    if (otio.OTIO_SCHEMA !== 'Timeline.1') {
      throw new Error(`Unsupported OTIO schema: ${otio.OTIO_SCHEMA}`);
    }
    return this.import(otio, targetFps);
  }

  private fromOTIOTrack(track: OTIOTrack, fps: number): ArtoneTrack {
    const clips: ArtoneClip[] = [];
    let cursor = 0;
    let pendingTransition: ArtoneTransition | null = null;

    for (const child of track.children) {
      if (child.OTIO_SCHEMA === 'Clip.1' || child.OTIO_SCHEMA === 'Clip.2') {
        const artoneClip = this.fromOTIOClip(child as OTIOClip, cursor, fps);
        if (pendingTransition) {
          artoneClip.transitionIn = pendingTransition;
          // 直前クリップに transitionOut も付与
          const prev = clips[clips.length - 1];
          if (prev) prev.transitionOut = pendingTransition;
          pendingTransition = null;
        }
        clips.push(artoneClip);
        cursor += fromRationalTime(child.source_range.duration, fps);
      } else if (child.OTIO_SCHEMA === 'Gap.1') {
        cursor += fromRationalTime((child as OTIOGap).source_range.duration, fps);
      } else if (child.OTIO_SCHEMA === 'Transition.1') {
        const tr = child as OTIOTransition;
        const inFrames = fromRationalTime(tr.in_offset, fps);
        const outFrames = fromRationalTime(tr.out_offset, fps);
        const meta = (tr.metadata?.artone as { type?: string } | undefined)?.type;
        pendingTransition = {
          type: meta ?? (tr.transition_type === 'SMPTE_Dissolve' ? 'dissolve' : tr.transition_type),
          inFrames,
          outFrames,
          parameters: tr.parameters,
        };
      }
    }

    return {
      name: track.name ?? 'Track',
      kind: track.kind === 'Video' ? 'video' : 'audio',
      clips,
      enabled: true,
    };
  }

  private fromOTIOClip(clip: OTIOClip, startFrame: number, fps: number): ArtoneClip {
    const ref = clip.media_reference;
    const url = ref.OTIO_SCHEMA === 'ExternalReference.1' ? ref.target_url ?? '' : '';
    const artoneId =
      (clip.metadata?.artone as { clipId?: string } | undefined)?.clipId ??
      `imported-${Math.random().toString(36).slice(2, 11)}`;

    return {
      id: artoneId,
      name: clip.name,
      startFrame,
      durationFrames: fromRationalTime(clip.source_range.duration, fps),
      sourceInFrame: fromRationalTime(clip.source_range.start_time, fps),
      mediaUrl: url,
      effects: clip.effects.map((e) => this.fromOTIOEffect(e)),
      markers: clip.markers.map((m) => this.fromOTIOMarker(m, fps)),
      enabled: clip.enabled ?? true,
    };
  }

  private fromOTIOEffect(eff: OTIOEffect): ArtoneEffect {
    const params =
      (eff.metadata?.artone as { params?: Record<string, unknown> } | undefined)?.params ?? {};
    return { type: eff.effect_name, name: eff.name ?? eff.effect_name, params };
  }

  private fromOTIOMarker(m: OTIOMarker, fps: number): ArtoneMarker {
    return {
      frame: fromRationalTime(m.marked_range.start_time, fps),
      duration: fromRationalTime(m.marked_range.duration, fps),
      color: COLOR_MAP_OTIO_TO_ARTONE[m.color] ?? 'red',
      name: m.name ?? '',
      comment: m.comment,
    };
  }
}

// === 検証 ===

export class OTIOValidator {
  validate(otio: unknown): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    const t = otio as Partial<OTIOTimeline>;

    if (t.OTIO_SCHEMA !== 'Timeline.1') errors.push('Root schema must be Timeline.1');
    if (!t.tracks) errors.push('Missing tracks (Stack)');
    else if (t.tracks.OTIO_SCHEMA !== 'Stack.1') errors.push('tracks must be Stack.1');
    if (typeof t.name !== 'string') errors.push('Missing name');

    return { valid: errors.length === 0, errors };
  }
}

// === ファクトリ ===

export const otio = {
  exporter: () => new OTIOExporter(),
  importer: () => new OTIOImporter(),
  validator: () => new OTIOValidator(),
};
