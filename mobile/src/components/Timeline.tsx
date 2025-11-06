import React, {useRef, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Dimensions,
  Animated,
} from 'react-native';
import {useVideoStore} from '../store/videoStore';

const {width: screenWidth} = Dimensions.get('window');

interface TimelineProps {
  style?: any;
}

export const Timeline: React.FC<TimelineProps> = ({style}) => {
  const {
    project,
    selectedClip,
    playhead,
    zoom,
    isPlaying,
    setSelectedClip,
    updateClip,
    seek,
  } = useVideoStore();

  const [draggedClip, setDraggedClip] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  const timelineRef = useRef<View>(null);

  const pixelsPerSecond = 80 * zoom;
  const timelineWidth = Math.max(screenWidth - 64, (project?.duration || 30) * pixelsPerSecond);

  const handleClipPress = (clipId: string) => {
    setSelectedClip(clipId);
  };

  const handleTimelinePress = (event: any) => {
    if (!project) return;

    const {locationX} = event.nativeEvent;
    const newTime = (locationX / pixelsPerSecond);
    seek(Math.max(0, Math.min(newTime, project.duration)));
  };

  const createPanResponder = (clipId: string) => {
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,

      onPanResponderGrant: (event) => {
        setDraggedClip(clipId);
        const clip = project?.clips.find(c => c.id === clipId);
        if (clip) {
          setDragOffset(clip.start - (event.nativeEvent.locationX / pixelsPerSecond));
        }
      },

      onPanResponderMove: (event) => {
        if (!project || draggedClip !== clipId) return;

        const newStart = Math.max(
          0,
          (event.nativeEvent.locationX / pixelsPerSecond) + dragOffset
        );

        updateClip(clipId, {start: newStart});
      },

      onPanResponderRelease: () => {
        setDraggedClip(null);
        setDragOffset(0);
      },
    });
  };

  const handleClipTrim = (clipId: string, edge: 'start' | 'end', deltaX: number) => {
    const clip = project?.clips.find(c => c.id === clipId);
    if (!clip) return;

    const deltaTime = deltaX / pixelsPerSecond;

    if (edge === 'start') {
      const newStart = Math.max(0, clip.start + deltaTime);
      const newDuration = Math.max(0.1, clip.duration - deltaTime);
      updateClip(clipId, {start: newStart, duration: newDuration});
    } else {
      const newDuration = Math.max(0.1, clip.duration + deltaTime);
      updateClip(clipId, {duration: newDuration});
    }
  };

  const renderClip = (clip: any, trackHeight: number) => {
    const isSelected = selectedClip?.id === clip.id;
    const clipWidth = clip.duration * pixelsPerSecond;
    const clipLeft = clip.start * pixelsPerSecond;

    // クリップの最小幅を確保
    const minWidth = 40;
    const finalWidth = Math.max(clipWidth, minWidth);

    return (
      <View key={clip.id} style={styles.clipContainer}>
        {/* メインクリップ */}
        <TouchableOpacity
          {...createPanResponder(clip.id).panHandlers}
          style={[
            styles.clip,
            {
              left: clipLeft,
              width: finalWidth,
              height: trackHeight - 16,
              backgroundColor: isSelected ? '#3b82f6' : '#475569',
            },
          ]}
          onPress={() => handleClipPress(clip.id)}
          activeOpacity={0.8}
        >
          <Text style={styles.clipText} numberOfLines={1}>
            {clip.name}
          </Text>
          <Text style={styles.clipDuration}>
            {clip.duration.toFixed(1)}s
          </Text>
        </TouchableOpacity>

        {/* トリムハンドル - 開始位置 */}
        <TouchableOpacity
          style={[
            styles.trimHandle,
            {
              left: clipLeft - 10,
              width: 20,
              height: trackHeight - 8,
            },
          ]}
          onPress={() => {/* トリム開始 */}}
        >
          <View style={styles.trimHandleBar} />
        </TouchableOpacity>

        {/* トリムハンドル - 終了位置 */}
        <TouchableOpacity
          style={[
            styles.trimHandle,
            {
              left: clipLeft + finalWidth - 10,
              width: 20,
              height: trackHeight - 8,
            },
          ]}
          onPress={() => {/* トリム終了 */}}
        >
          <View style={styles.trimHandleBar} />
        </TouchableOpacity>
      </View>
    );
  };

  const renderTrack = (track: any) => {
    const trackHeight = track.height || 80;

    return (
      <View key={track.id} style={[styles.track, {height: trackHeight}]}>
        <Text style={styles.trackName}>{track.name}</Text>
        <View style={styles.clipsContainer}>
          {project?.clips
            .filter(clip => clip.trackId === track.id)
            .map(clip => renderClip(clip, trackHeight))}
        </View>
      </View>
    );
  };

  if (!project) {
    return (
      <View style={[styles.timeline, style]}>
        <Text style={styles.emptyText}>No project loaded</Text>
      </View>
    );
  }

  return (
    <View style={[styles.timeline, style]}>
      {/* タイムラインヘッダー */}
      <View style={styles.timelineHeader}>
        <View style={styles.timeRuler}>
          {Array.from({length: Math.ceil(project.duration) + 1}, (_, i) => (
            <View key={i} style={styles.timeMarker}>
              <Text style={styles.timeMarkerText}>{i}s</Text>
            </View>
          ))}
        </View>
      </View>

      {/* トラックコンテナ */}
      <View style={styles.tracksContainer}>
        {project.tracks.map(renderTrack)}
      </View>

      {/* プレイヘッド */}
      <View
        style={[
          styles.playhead,
          {
            left: (playhead * pixelsPerSecond) % timelineWidth,
          },
        ]}
      />

      {/* グリッドライン */}
      <View style={styles.gridContainer}>
        {Array.from({length: Math.ceil(project.duration) + 1}, (_, i) => (
          <View
            key={i}
            style={[
              styles.gridLine,
              {
                left: i * pixelsPerSecond,
              },
            ]}
          />
        ))}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  timeline: {
    backgroundColor: '#0f172a',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  timelineHeader: {
    height: 30,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  timeRuler: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  timeMarker: {
    width: 80,
    alignItems: 'center',
  },
  timeMarkerText: {
    color: '#64748b',
    fontSize: 10,
    fontFamily: 'monospace',
  },
  tracksContainer: {
    flex: 1,
    padding: 8,
  },
  track: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
    backgroundColor: '#1e293b',
    borderRadius: 4,
    padding: 8,
  },
  trackName: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
    width: 80,
    textAlign: 'center',
  },
  clipsContainer: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  clipContainer: {
    position: 'relative',
  },
  clip: {
    position: 'absolute',
    borderRadius: 4,
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 40,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 1},
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  clipText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  clipDuration: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 8,
    marginTop: 2,
  },
  trimHandle: {
    position: 'absolute',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#3b82f6',
    borderRadius: 2,
  },
  trimHandleBar: {
    width: 2,
    height: 20,
    backgroundColor: 'white',
  },
  playhead: {
    position: 'absolute',
    top: 30,
    width: 2,
    height: '100%',
    backgroundColor: '#ef4444',
    zIndex: 10,
    elevation: 3,
  },
  gridContainer: {
    position: 'absolute',
    top: 30,
    left: 0,
    right: 0,
    bottom: 0,
  },
  gridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 1,
    backgroundColor: '#334155',
  },
  emptyText: {
    color: '#64748b',
    textAlign: 'center',
    marginTop: 20,
  },
});
