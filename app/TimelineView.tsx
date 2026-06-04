/**
 * Artone v3 — Timeline View
 *
 * マルチトラック・ズーム・ドラッグ対応のタイムラインUI
 * 設計: 60fps描画優先 (Carmack), 単一責任 (Martin)
 *
 * @version 3.0.0
 */

import { color } from './design-system';
import React, { useEffect, useRef, useState, useCallback } from 'react';


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

const Ruler: React.FC<{ duration: number; pxPerSecond: number; offset: number }> = ({
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
};

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
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
  onMouseDown: (e: React.MouseEvent, mode: 'move' | 'resize-l' | 'resize-r') => void;
}

const ClipView: React.FC<ClipViewProps> = ({
  clip,
  trackTop,
  trackHeight,
  pxPerSecond,
  offset,
  trackType,
  onMouseDown
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
        userSelect: 'none'
      }}
      onMouseDown={(e) => {
        const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const x = e.clientX - rect.left;
        if (x < 6) onMouseDown(e, 'resize-l');
        else if (x > rect.width - 6) onMouseDown(e, 'resize-r');
        else onMouseDown(e, 'move');
      }}
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
};

// ============================================================
// Track Header
// ============================================================

const TrackHeader: React.FC<{ track: TimelineTrack; top: number }> = ({ track, top }) => (
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
);

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
  const [scrollX, setScrollX] = useState(0);
  const HEADER_W = 120;

  const totalHeight = tracks.reduce((sum, t) => sum + t.height, 0);

  const dragRef = useRef<{
    clipId: string;
    mode: 'move' | 'resize-l' | 'resize-r';
    startX: number;
    initialStart: number;
    initialDuration: number;
  } | null>(null);

  // Drag handler
  const handleMouseDown = useCallback(
    (clip: TimelineClip, e: React.MouseEvent, mode: 'move' | 'resize-l' | 'resize-r') => {
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

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      const dx = (e.clientX - drag.startX) / pxPerSecond;
      if (drag.mode === 'move') {
        onClipMove(drag.clipId, Math.max(0, drag.initialStart + dx));
      } else if (drag.mode === 'resize-l') {
        const newStart = Math.max(0, drag.initialStart + dx);
        const newDur = drag.initialDuration - (newStart - drag.initialStart);
        if (newDur > 0.05) onClipResize(drag.clipId, newStart, newDur);
      } else if (drag.mode === 'resize-r') {
        const newDur = Math.max(0.05, drag.initialDuration + dx);
        onClipResize(drag.clipId, drag.initialStart, newDur);
      }
    };
    const onUp = () => {
      dragRef.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pxPerSecond, onClipMove, onClipResize]);

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
      const x = e.clientX - rect.left + scrollX - HEADER_W;
      onPlayheadChange(Math.max(0, x / pxPerSecond));
    },
    [pxPerSecond, scrollX, onPlayheadChange]
  );

  let trackTop = 0;
  const trackPositions = tracks.map((track) => {
    const top = trackTop;
    trackTop += track.height;
    return { track, top };
  });

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
      onScroll={(e) => setScrollX((e.currentTarget as HTMLDivElement).scrollLeft)}
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
          const pos = trackPositions.find((p) => p.track.id === clip.trackId);
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
              onMouseDown={(e, mode) => handleMouseDown(clip, e, mode)}
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
