/**
 * Timeline Body Component
 *
 * This component renders the main timeline body with tracks and clips.
 */

import * as React from 'react';
import styled from '@emotion/styled';
import { TimelineTrack } from '../TimelineTrack';
import { TimelineClip } from '../TimelineClip';
import { PlayheadLine } from '../PlayheadLine';
import type { TimelineRenderResult, TimelineEventHandlers } from '../pipeline/types';

const TimelineBodyWrapper = styled.div`
  display: flex;
  flex: 1;
  overflow: hidden;
`;

const TrackList = styled.div`
  width: 200px;
  background: #1e293b;
  border-right: 1px solid #334155;
  overflow-y: auto;
`;

const TrackListHeader = styled.div`
  width: 200px;
  padding: 0.5rem;
  background: #1e293b;
  border-right: 1px solid #334155;
  display: flex;
  align-items: center;
  justify-content: space-between;
`;

const TimelineContent = styled.div`
  flex: 1;
  position: relative;
  overflow: auto;
`;

const TracksContainer = styled.div`
  position: relative;
  min-height: 100%;
`;

const TimelineCanvas = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
`;

const AddTrackButton = styled.button`
  padding: 0.25rem 0.5rem;
  background: #3b82f6;
  color: white;
  border: none;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;

  &:hover {
    background: #2563eb;
  }
`;

interface TimelineBodyProps {
  renderResult: TimelineRenderResult;
  contentRef: React.RefObject<HTMLDivElement>;
  selectedClipId: string | null;
  pixelsPerSecond: number;
  onTimelineClick: TimelineEventHandlers['onTimelineClick'];
  onClipMouseDown: TimelineEventHandlers['onClipMouseDown'];
  onClipKeyDown: TimelineEventHandlers['onClipKeyDown'];
  onWheelZoom: TimelineEventHandlers['onWheelZoom'];
  onAddTrack: () => void;
}

export const TimelineBody: React.FC<TimelineBodyProps> = ({
  renderResult,
  contentRef,
  selectedClipId,
  pixelsPerSecond,
  onTimelineClick,
  onClipMouseDown,
  onClipKeyDown,
  onWheelZoom,
  onAddTrack
}) => {
  return (
    <TimelineBodyWrapper>
      <TrackList>
        <TrackListHeader>
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Tracks</span>
          <AddTrackButton onClick={onAddTrack}>+ Track</AddTrackButton>
        </TrackListHeader>
        {renderResult.tracks.map((track) => (
          <TimelineTrack key={track.id} track={track} />
        ))}
      </TrackList>

      <TimelineContent
        ref={contentRef}
        onClick={onTimelineClick}
        onWheel={onWheelZoom}
        style={{ width: renderResult.timelineWidth }}
      >
        <TracksContainer>
          {renderResult.tracks.map((track) => (
            <div
              key={track.id}
              data-track-id={track.id}
              style={{
                position: 'relative',
                height: track.height,
                borderBottom: '1px solid #334155'
              }}
            >
              {track.clips.map((clip) => (
                <TimelineClip
                  key={clip.id}
                  clip={clip}
                  pixelsPerSecond={pixelsPerSecond}
                  isSelected={selectedClipId === clip.id}
                  onMouseDown={(event: React.MouseEvent) => onClipMouseDown(event, clip.id)}
                  onKeyDown={(event: React.KeyboardEvent) => onClipKeyDown(event, clip)}
                />
              ))}
            </div>
          ))}
          <PlayheadLine
            position={renderResult.playheadPosition}
            height={renderResult.tracks.reduce((sum, t) => sum + t.height, 0)}
          />
        </TracksContainer>
      </TimelineContent>
    </TimelineBodyWrapper>
  );
};
