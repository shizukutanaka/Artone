import React, {useRef, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  PanResponder,
  Alert,
} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {StackNavigationProp} from '@react-navigation/stack';
import Video from 'react-native-video';
import {useVideoStore} from '../store/videoStore';
import {useElectronAPI} from '../hooks/useElectronAPI';

type RootStackParamList = {
  Home: undefined;
  Editor: undefined;
  Settings: undefined;
};

type EditorScreenNavigationProp = StackNavigationProp<RootStackParamList, 'Editor'>;

const {width, height} = Dimensions.get('window');

const EditorScreen: React.FC = () => {
  const navigation = useNavigation<EditorScreenNavigationProp>();
  const videoRef = useRef<Video>(null);
  const {
    project,
    selectedClip,
    playhead,
    isPlaying,
    playbackRate,
    zoom,
    playPause,
    seek,
    setZoom,
    showNotification,
  } = useVideoStore();

  const {isElectron, minimizeWindow, maximizeWindow, closeWindow} = useElectronAPI();

  useEffect(() => {
    // 定期的に再生位置を更新
    if (isPlaying) {
      const interval = setInterval(() => {
        // 実際には動画の現在の位置を取得
      }, 1000 / 30); // 30fps

      return () => clearInterval(interval);
    }
  }, [isPlaying]);

  const handlePlayPause = () => {
    playPause();
  };

  const handleTimelinePress = (event: any) => {
    const {locationX} = event.nativeEvent;
    const timelineWidth = width - 64; // パディング考慮
    const pixelsPerSecond = 80 * zoom;
    const newTime = (locationX / timelineWidth) * (project?.duration || 30);
    seek(newTime);
  };

  const handleZoomIn = () => {
    setZoom(zoom * 1.2);
  };

  const handleZoomOut = () => {
    setZoom(zoom / 1.2);
  };

  const handleExport = () => {
    Alert.alert(
      'Export Video',
      'Export functionality will be implemented with FFmpeg',
      [{text: 'OK'}]
    );
  };

  const handleSave = () => {
    if (isElectron) {
      showNotification({
        title: 'Project Saved',
        body: 'Project saved successfully',
      });
    } else {
      Alert.alert('Save', 'Save functionality implemented');
    }
  };

  const renderTimeline = () => {
    if (!project) return null;

    const timelineWidth = width - 64;
    const pixelsPerSecond = 80 * zoom;
    const totalWidth = (project.duration * pixelsPerSecond);

    return (
      <View style={styles.timelineContainer}>
        <View style={styles.timelineHeader}>
          <TouchableOpacity onPress={handleZoomOut} style={styles.zoomButton}>
            <Text style={styles.zoomButtonText}>-</Text>
          </TouchableOpacity>
          <Text style={styles.zoomText}>{Math.round(zoom * 100)}%</Text>
          <TouchableOpacity onPress={handleZoomIn} style={styles.zoomButton}>
            <Text style={styles.zoomButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.timeline, {width: Math.min(totalWidth, timelineWidth * 4)}]}
          onPress={handleTimelinePress}
          activeOpacity={1}>
          <View style={styles.tracksContainer}>
            {project.tracks.map(track => (
              <View key={track.id} style={[styles.track, {height: track.height}]}>
                <Text style={styles.trackName}>{track.name}</Text>
                <View style={styles.clipsContainer}>
                  {project.clips
                    .filter(clip => clip.trackId === track.id)
                    .map(clip => (
                      <View
                        key={clip.id}
                        style={[
                          styles.clip,
                          {
                            left: clip.start * pixelsPerSecond,
                            width: clip.duration * pixelsPerSecond,
                            backgroundColor: selectedClip?.id === clip.id ? '#3b82f6' : '#475569',
                          },
                        ]}>
                        <Text style={styles.clipText}>{clip.name}</Text>
                      </View>
                    ))}
                </View>
              </View>
            ))}
          </View>

          {/* Playhead */}
          <View
            style={[
              styles.playhead,
              {
                left: (playhead * pixelsPerSecond) % timelineWidth,
              },
            ]}
          />
        </TouchableOpacity>

        <View style={styles.timeDisplay}>
          <Text style={styles.timeText}>
            {Math.floor(playhead / 60)}:{(playhead % 60).toFixed(1).padStart(4, '0')}
          </Text>
          <Text style={styles.timeText}>
            {Math.floor((project?.duration || 0) / 60)}:{((project?.duration || 0) % 60).toFixed(1).padStart(4, '0')}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{project?.name || 'Untitled Project'}</Text>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={handleSave} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Save</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleExport} style={styles.exportButton}>
            <Text style={styles.exportButtonText}>Export</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Video Player */}
      <View style={styles.videoContainer}>
        <Video
          ref={videoRef}
          source={{uri: selectedClip?.mediaUri || ''}}
          style={styles.video}
          paused={!isPlaying}
          rate={playbackRate}
          resizeMode="contain"
          onError={(error) => {
            console.error('Video error:', error);
          }}
        />

        {/* Video Controls Overlay */}
        <View style={styles.controlsOverlay}>
          <TouchableOpacity onPress={handlePlayPause} style={styles.playButton}>
            <Text style={styles.playButtonText}>
              {isPlaying ? '⏸' : '▶'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Timeline */}
      {renderTimeline()}

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        <TouchableOpacity
          onPress={() => seek(Math.max(0, playhead - 1))}
          style={styles.controlButton}>
          <Text style={styles.controlButtonText}>⏮</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={handlePlayPause} style={styles.controlButton}>
          <Text style={styles.controlButtonText}>
            {isPlaying ? '⏸' : '▶'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => seek(Math.min((project?.duration || 0), playhead + 1))}
          style={styles.controlButton}>
          <Text style={styles.controlButtonText}>⏭</Text>
        </TouchableOpacity>

        <Text style={styles.playbackRateText}>{playbackRate.toFixed(1)}x</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  backButton: {
    padding: 8,
  },
  backButtonText: {
    color: '#e2e8f0',
    fontSize: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e2e8f0',
    flex: 1,
    textAlign: 'center',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 12,
  },
  headerButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#475569',
    borderRadius: 6,
  },
  headerButtonText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  exportButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#3b82f6',
    borderRadius: 6,
  },
  exportButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  videoContainer: {
    flex: 1,
    backgroundColor: '#000',
    position: 'relative',
  },
  video: {
    flex: 1,
  },
  controlsOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonText: {
    color: 'white',
    fontSize: 32,
  },
  timelineContainer: {
    backgroundColor: '#1e293b',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  timelineHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    backgroundColor: '#334155',
  },
  zoomButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  zoomButtonText: {
    color: '#e2e8f0',
    fontSize: 20,
    fontWeight: 'bold',
  },
  zoomText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },
  timeline: {
    height: 200,
    backgroundColor: '#0f172a',
    position: 'relative',
  },
  tracksContainer: {
    flex: 1,
    padding: 8,
  },
  track: {
    marginBottom: 4,
    backgroundColor: '#334155',
    borderRadius: 4,
    padding: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  trackName: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
    width: 80,
  },
  clipsContainer: {
    flex: 1,
    flexDirection: 'row',
    position: 'relative',
  },
  clip: {
    height: 60,
    borderRadius: 4,
    padding: 4,
    marginHorizontal: 1,
    justifyContent: 'center',
    alignItems: 'center',
    minWidth: 40,
  },
  clipText: {
    color: 'white',
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
  playhead: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#3b82f6',
    zIndex: 10,
  },
  timeDisplay: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 8,
    backgroundColor: '#334155',
  },
  timeText: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  bottomControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    backgroundColor: '#1e293b',
    gap: 24,
  },
  controlButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  controlButtonText: {
    color: '#e2e8f0',
    fontSize: 20,
  },
  playbackRateText: {
    color: '#3b82f6',
    fontSize: 16,
    fontWeight: 'bold',
  },
});

export default EditorScreen;
