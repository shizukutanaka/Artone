/**
 * Artone v3 — Timeline View
 *
 * マルチトラック・ズーム・ドラッグ対応のタイムラインUI
 * 設計: 60fps描画優先 (Carmack), 単一責任 (Martin)
 *
 * @version 3.0.0
 */

import { color } from './design-system';
import React, { useRef, useCallback, useMemo } from 'react';


// ============================================================
// Types
// ============================================================

export type TrackType = 'video' | 'audio' | 'text';

export interface TimelineClip {
  id: string;
  trackId: string;
  start: number; // seconds
  duration: number;
  name: string;
  color?: string;
  selected?: boolean;
}

export interface TimelineTrack {
  id: string;
  type: TrackType;
  name: string;
  height: number;
  muted?: boolean;
  locked?: boolean;
}

// ============================================================
// Drag math (pure — unit tested independent of the DOM)
// ============================================================

export type ClipDragMode = 'move' | 'resize-l' | 'resize-r';

export interface ClipDragState {
  clipId: string;
  mode: ClipDragMode;
  /** Pointer X at drag start (px). */
  startX: number;
  initialStart: number;
  initialDuration: number;
}

export interface ClipDragResult {
  clipId: string;
  start: number;
  duration: number;
}

/** Minimum clip duration (seconds) — a clip cannot be trimmed below this. */
export const MIN_CLIP_DURATION = 0.05;

/**
 * Compute the new clip start/duration for an in-progress drag.
 *
 * Returns `null` when the gesture would shrink either end below `MIN_CLIP_DURATION`
 * (the caller should leave the clip unchanged) or when `pxPerSecond ≤ 0`.
 * Both `resize-l` and `resize-r` use the same null-return contract for
 * consistency — there is no silent clamping on the right side.
 */
export function computeClipDrag(
  drag: ClipDragState,
  clientX: number,
  pxPerSecond: number,
): ClipDragResult | null {
  if (!(pxPerSecond > 0)) return null;
  const dx = (clientX - drag.startX) / pxPerSecond;

  if (drag.mode === 'move') {
    return {
      clipId: drag.clipId,
      start: Math.max(0, drag.initialStart + dx),
      duration: drag.initialDuration,
    };
  }
  if (drag.mode === 'resize-l') {
    const newStart = Math.max(0, drag.initialStart + dx);
    const newDuration = drag.initialDuration - (newStart - drag.initialStart);
    if (newDuration > MIN_CLIP_DURATION) {
      return { clipId: drag.clipId, start: newStart, duration: newDuration };
    }
    return null;
  }
  // resize-r: mirror resize-l — refuse the gesture rather than silently clamping
  const newDuration = drag.initialDuration + dx;
  if (newDuration <= MIN_CLIP_DURATION) return null;
  return { clipId: drag.clipId, start: drag.initialStart, duration: newDuration };
}

/** Edge hit-zone width (px) for resize vs move on a clip. */
export const CLIP_EDGE_PX = 6;

/**
 * Classify a pointer-down on a clip into a drag mode from its X offset within
 * the clip: within {@link CLIP_EDGE_PX} of the left edge → `resize-l`, within
 * that of the right edge → `resize-r`, otherwise `move`. The left edge wins when
 * a clip is so narrow the two hit-zones overlap (matches the original inline
 * `if/else if` order).
 *
 * @param offsetX Pointer X relative to the clip's left edge (px).
 * @param width   Clip width (px).
 */
export function clipDragModeForX(offsetX: number, width: number): ClipDragMode {
  if (offsetX < CLIP_EDGE_PX) return 'resize-l';
  if (offsetX > width - CLIP_EDGE_PX) return 'resize-r';
  return 'move';
}

/**
 * Convert a ruler click's viewport X to a playhead time in seconds.
 *
 * `rectLeft` (from the ruler element's `getBoundingClientRect().left`)
 * already reflects both the track area's header offset and the current
 * scroll position — the ruler div is an ordinary (non-horizontally-sticky)
 * child of the scrolling container, positioned the same way clips are
 * (`left: clip.start * pxPerSecond` inside the same `marginLeft: HEADER_W`
 * track div). No further correction should be applied.
 */
export function computeRulerClickTime(clientX: number, rectLeft: number, pxPerSecond: number): number {
  return Math.max(0, (clientX - rectLeft) / pxPerSecond);
}

export interface TimelineViewProps {
  tracks: TimelineTrack[];
  clips: TimelineClip[];
  duration: number;
  playhead: number;
  pxPerSecond: number;
  onPlayheadChange: (t: number) => void;
  onClipMove: (clipId: string, newStart: number, newTrackId?: string) => void;
  onClipSelect: (clipId: string, multi: boolean) => void;
  onClipResize: (clipId: string, newStart: number, newDuration: number) => void;
  onZoomChange: (px: number) => void;
}

// ============================================================
// Ruler
// ============================================================

const Ruler: React.FC<{ duration: number; pxPerSecond: number; offset: number }> = React.memo(({
  duration,
  pxPerSecond,
  offset
}) => {
  const interval = pxPerSecond < 20 ? 5 : pxPerSecond < 50 ? 1 : 0.5;
  const ticks: number[] = [];
  for (let t = 0; t <= duration; t += interval) ticks.push(t);

  return (
    <div
      style={{
        height: 24,
        background: color.surface1,
        borderBottom: `1px solid ${color.border}`,
        position: 'relative',
        overflow: 'hidden',
        userSelect: 'none'
      }}
    >
      {ticks.map((t) => {
        const left = offset + t * pxPerSecond;
        return (
          <div
            key={t}
            style={{
              position: 'absolute',
              left,
              top: 0,
              height: '100%',
              width: 1,
              background: color.border
            }}
          >
            <span
              style={{
                position: 'absolute',
                left: 4,
                top: 4,
                fontSize: 10,
                color: color.textTertiary,
                fontFamily: 'ui-monospace, monospace',
                whiteSpace: 'nowrap'
              }}
            >
              {formatTime(t)}
            </span>
          </div>
        );
      })}
    </div>
  );
});
Ruler.displayName = 'Ruler';

/**
 * ルーラー用の時刻ラベル整形 (m:ss.cc、cc はセンチ秒)。
 *
 * 継続時間を整数センチ秒へ **1度だけ丸めて** から純整数演算で分解する。
 * 以前は `Math.floor((seconds % 1) * 100)` を使っており、`(4.13 % 1) * 100 =
 * 12.999…` のように多くの値で二進表現誤差により1つ小さいセンチ秒を返した
 * (captions / text-based-editing / marker-manager で修正済みの同じ機構のバグ)。
 * 現状ルーラーの目盛りは 0.5 秒刻みのみを渡すため実害は顕在化しないが、汎用の
 * 表示ヘルパとして任意入力で正しくし、コードベース全体の時刻整形と一貫させる。
 * export はテスト可能化のため (既存 computeClipDrag 等と同様)。
 */
export function formatTime(seconds: number): string {
  const totalCs = Math.max(0, Math.round(seconds * 100));
  const cs = totalCs % 100;
  const totalS = (totalCs - cs) / 100;
  const s = totalS % 60;
  const m = (totalS - s) / 60;
  return `${m}:${s.toString().padStart(2, '0')}.${cs.toString().padStart(2, '0')}`;
}

// ============================================================
// Clip
// ============================================================

interface ClipViewProps {
  clip: TimelineClip;
  trackTop: number;
  trackHeight: number;
  pxPerSecond: number;
  offset: number;
  trackType: TrackType;
  /** Receives the clip so the parent can pass one stable callback for all clips. */
  onPointerDown: (clip: TimelineClip, e: React.PointerEvent, mode: ClipDragMode) => void;
  onPointerDrag: (e: React.PointerEvent) => void;
  onPointerEnd: (e: React.PointerEvent) => void;
}

const ClipView: React.FC<ClipViewProps> = React.memo(({
  clip,
  trackTop,
  trackHeight,
  pxPerSecond,
  offset,
  trackType,
  onPointerDown,
  onPointerDrag,
  onPointerEnd
}) => {
  const left = offset + clip.start * pxPerSecond;
  const width = clip.duration * pxPerSecond;
  const baseColor =
    clip.color || (trackType === 'video' ? color.brand : trackType === 'audio' ? color.positive : color.info);

  return (
    <div
      style={{
        position: 'absolute',
        left,
        top: trackTop + 2,
        width,
        height: trackHeight - 4,
        background: baseColor,
        opacity: clip.selected ? 1 : 0.85,
        border: clip.selected ? `2px solid ${color.brand}` : `1px solid ${baseColor}`,
        borderRadius: 4,
        cursor: 'grab',
        overflow: 'hidden',
        userSelect: 'none',
        // Prevent the browser from scrolling/zooming the page on touch-drag so
        // the pointer gesture is delivered to us (required for touch support).
        touchAction: 'none'
      }}
      onPointerDown={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        // Capture the pointer so move/up events keep flowing to this element even
        // when the pointer leaves it — unifies mouse, touch and pen.
        e.currentTarget.setPointerCapture?.(e.pointerId);
        onPointerDown(clip, e, clipDragModeForX(x, rect.width));
      }}
      onPointerMove={onPointerDrag}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
    >
      <div
        style={{
          padding: '4px 8px',
          fontSize: 11,
          color: color.textPrimary,
          fontWeight: 500,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}
      >
        {clip.name}
      </div>
    </div>
  );
});
ClipView.displayName = 'ClipView';

// ============================================================
// Track Header
// ============================================================

const TrackHeader: React.FC<{ track: TimelineTrack; top: number }> = React.memo(({ track, top }) => (
  <div
    style={{
      position: 'absolute',
      left: 0,
      top,
      width: 120,
      height: track.height,
      background: color.surface1,
      borderBottom: `1px solid ${color.border}`,
      borderRight: `1px solid ${color.border}`,
      padding: '4px 8px',
      fontSize: 11,
      color: color.textTertiary,
      display: 'flex',
      alignItems: 'center',
      gap: 4
    }}
  >
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: '50%',
        background:
          track.type === 'video' ? color.brand : track.type === 'audio' ? color.positive : color.info
      }}
    />
    {track.name}
  </div>
));
TrackHeader.displayName = 'TrackHeader';

// ============================================================
// Main TimelineView
// ============================================================

export const TimelineView: React.FC<TimelineViewProps> = ({
  tracks,
  clips,
  duration,
  playhead,
  pxPerSecond,
  onPlayheadChange,
  onClipMove,
  onClipSelect,
  onClipResize,
  onZoomChange
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const HEADER_W = 120;

  // Memoize layout derived from tracks — these don't change on every playhead
  // tick, but TimelineView re-renders at 60fps when playhead moves.
  const totalHeight = useMemo(
    () => tracks.reduce((sum, t) => sum + t.height, 0),
    [tracks],
  );

  const dragRef = useRef<ClipDragState | null>(null);

  // Pointer-based drag (mouse + touch + pen). setPointerCapture on the clip
  // element routes move/up here without document-level listeners.
  const handlePointerDown = useCallback(
    (clip: TimelineClip, e: React.PointerEvent, mode: ClipDragMode) => {
      e.stopPropagation();
      onClipSelect(clip.id, e.shiftKey);
      dragRef.current = {
        clipId: clip.id,
        mode,
        startX: e.clientX,
        initialStart: clip.start,
        initialDuration: clip.duration
      };
    },
    [onClipSelect]
  );

  const handlePointerDrag = useCallback(
    (e: React.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const result = computeClipDrag(drag, e.clientX, pxPerSecond);
      if (!result) return;
      if (drag.mode === 'move') {
        onClipMove(result.clipId, result.start);
      } else {
        onClipResize(result.clipId, result.start, result.duration);
      }
    },
    [pxPerSecond, onClipMove, onClipResize]
  );

  const handlePointerEnd = useCallback(() => {
    dragRef.current = null;
  }, []);

  // Wheel zoom
  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
        onZoomChange(Math.max(5, Math.min(500, pxPerSecond * factor)));
      }
    },
    [pxPerSecond, onZoomChange]
  );

  // Playhead click
  const handleRulerClick = useCallback(
    (e: React.MouseEvent) => {
      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
      onPlayheadChange(computeRulerClickTime(e.clientX, rect.left, pxPerSecond));
    },
    [pxPerSecond, onPlayheadChange]
  );

  const trackPositions = useMemo(() => {
    let top = 0;
    return tracks.map((track) => {
      const entry = { track, top };
      top += track.height;
      return entry;
    });
  }, [tracks]);

  // O(1) clip→track position lookup — replaces O(T) find() inside clips.map().
  const trackPosMap = useMemo(
    () => new Map(trackPositions.map((p) => [p.track.id, p])),
    [trackPositions],
  );

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: color.surface1,
        overflow: 'auto',
        userSelect: 'none'
      }}
      onWheel={handleWheel}
    >
      {/* Ruler */}
      <div
        style={{ position: 'sticky', top: 0, zIndex: 10, marginLeft: HEADER_W }}
        onClick={handleRulerClick}
      >
        <Ruler duration={duration} pxPerSecond={pxPerSecond} offset={0} />
      </div>

      {/* Track area */}
      <div
        style={{
          position: 'relative',
          marginLeft: HEADER_W,
          height: totalHeight,
          minWidth: duration * pxPerSecond
        }}
      >
        {/* Track backgrounds */}
        {trackPositions.map(({ track, top }, i) => (
          <div
            key={track.id}
            style={{
              position: 'absolute',
              left: 0,
              top,
              right: 0,
              height: track.height,
              background: i % 2 === 0 ? color.surface1 : color.surface2,
              borderBottom: `1px solid ${color.border}`
            }}
          />
        ))}

        {/* Clips */}
        {clips.map((clip) => {
          const pos = trackPosMap.get(clip.trackId);
          if (!pos) return null;
          return (
            <ClipView
              key={clip.id}
              clip={clip}
              trackTop={pos.top}
              trackHeight={pos.track.height}
              pxPerSecond={pxPerSecond}
              offset={0}
              trackType={pos.track.type}
              onPointerDown={handlePointerDown}
              onPointerDrag={handlePointerDrag}
              onPointerEnd={handlePointerEnd}
            />
          );
        })}

        {/* Playhead */}
        <div
          style={{
            position: 'absolute',
            left: playhead * pxPerSecond,
            top: 0,
            width: 2,
            height: '100%',
            background: color.playhead,
            pointerEvents: 'none',
            zIndex: 20
          }}
        />
      </div>

      {/* Track headers (sticky left) */}
      <div style={{ position: 'absolute', left: 0, top: 24, width: HEADER_W }}>
        {trackPositions.map(({ track, top }) => (
          <TrackHeader key={track.id} track={track} top={top} />
        ))}
      </div>
    </div>
  );
};

export default TimelineView;
