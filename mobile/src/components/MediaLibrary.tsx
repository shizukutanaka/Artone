import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Image,
  Alert,
  PermissionsAndroid,
  Platform,
} from 'react-native';
import {launchImageLibrary, ImagePickerResponse, MediaType} from 'react-native-image-picker';
import RNFS from 'react-native-fs';
import {useVideoStore} from '../store/videoStore';
import {MobileVideoProcessor} from '../services/videoProcessor';

interface MediaItem {
  id: string;
  name: string;
  uri: string;
  type: 'video' | 'audio' | 'image';
  duration?: number;
  size: number;
  thumbnail?: string;
  metadata?: any;
}

export const MediaLibrary: React.FC = () => {
  const {addMedia, importClip} = useVideoStore();
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  const videoProcessor = MobileVideoProcessor.getInstance();

  useEffect(() => {
    loadMediaLibrary();
  }, []);

  const loadMediaLibrary = async () => {
    if (Platform.OS === 'android') {
      await requestPermissions();
    }

    setIsLoading(true);
    try {
      const items = await scanMediaFiles();
      setMediaItems(items);
    } catch (error) {
      console.error('Failed to load media library:', error);
      Alert.alert('Error', 'Failed to load media files');
    } finally {
      setIsLoading(false);
    }
  };

  const requestPermissions = async () => {
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
        PermissionsAndroid.PERMISSIONS.WRITE_EXTERNAL_STORAGE,
      ]);

      const allGranted = Object.values(granted).every(
        result => result === PermissionsAndroid.RESULTS.GRANTED
      );

      if (!allGranted) {
        Alert.alert(
          'Permissions Required',
          'Storage permissions are required to access media files'
        );
      }
    } catch (error) {
      console.error('Permission request failed:', error);
    }
  };

  const scanMediaFiles = async (): Promise<MediaItem[]> => {
    const items: MediaItem[] = [];

    try {
      // 一般的なメディアディレクトリをスキャン
      const mediaDirs = [
        RNFS.ExternalStorageDirectoryPath + '/DCIM',
        RNFS.ExternalStorageDirectoryPath + '/Movies',
        RNFS.ExternalStorageDirectoryPath + '/Download',
      ];

      for (const dir of mediaDirs) {
        const exists = await RNFS.exists(dir);
        if (exists) {
          const files = await RNFS.readDir(dir);
          for (const file of files) {
            if (file.isFile() && isMediaFile(file.name)) {
              const item = await createMediaItem(file);
              if (item) items.push(item);
            }
          }
        }
      }
    } catch (error) {
      console.error('Media scan failed:', error);
    }

    return items.sort((a, b) => b.size - a.size);
  };

  const isMediaFile = (filename: string): boolean => {
    const videoExts = ['.mp4', '.avi', '.mov', '.mkv', '.webm'];
    const audioExts = ['.mp3', '.wav', '.aac', '.flac', '.ogg'];
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.bmp'];

    const ext = filename.toLowerCase().substring(filename.lastIndexOf('.'));
    return videoExts.includes(ext) || audioExts.includes(ext) || imageExts.includes(ext);
  };

  const createMediaItem = async (file: RNFS.ReadDirItem): Promise<MediaItem | null> => {
    try {
      const ext = file.name.toLowerCase().substring(file.name.lastIndexOf('.'));
      let type: 'video' | 'audio' | 'image';

      if (['.mp4', '.avi', '.mov', '.mkv', '.webm'].includes(ext)) {
        type = 'video';
      } else if (['.mp3', '.wav', '.aac', '.flac', '.ogg'].includes(ext)) {
        type = 'audio';
      } else if (['.jpg', '.jpeg', '.png', '.gif', '.bmp'].includes(ext)) {
        type = 'image';
      } else {
        return null;
      }

      const stat = await RNFS.stat(file.path);
      const metadata = await videoProcessor.getVideoMetadata(file.path);

      // サムネイル生成（動画の場合）
      let thumbnail: string | undefined;
      if (type === 'video') {
        const thumbnailPath = `${RNFS.TemporaryDirectoryPath}/thumb_${Date.now()}.jpg`;
        const success = await videoProcessor.generateThumbnail(file.path, thumbnailPath, 1);
        if (success) {
          thumbnail = thumbnailPath;
        }
      }

      return {
        id: `${type}_${Date.now()}_${Math.random()}`,
        name: file.name,
        uri: file.path,
        type,
        duration: metadata?.duration,
        size: stat.size,
        thumbnail,
        metadata,
      };
    } catch (error) {
      console.error('Failed to create media item:', error);
      return null;
    }
  };

  const selectMediaItem = (itemId: string) => {
    const newSelection = new Set(selectedItems);
    if (newSelection.has(itemId)) {
      newSelection.delete(itemId);
    } else {
      newSelection.add(itemId);
    }
    setSelectedItems(newSelection);
  };

  const importSelectedMedia = async () => {
    if (selectedItems.size === 0) {
      Alert.alert('No Selection', 'Please select media files to import');
      return;
    }

    try {
      for (const itemId of selectedItems) {
        const item = mediaItems.find(m => m.id === itemId);
        if (item) {
          // メディアファイルをプロジェクトに追加
          addMedia({
            id: item.id,
            name: item.name,
            uri: item.uri,
            type: item.type,
            duration: item.duration,
            thumbnail: item.thumbnail,
          });

          // クリップとしてタイムラインに追加
          importClip({
            id: `clip_${Date.now()}_${Math.random()}`,
            name: item.name,
            mediaId: item.id,
            trackId: 'main',
            start: 0,
            duration: item.duration || 30,
          });
        }
      }

      setSelectedItems(new Set());
      Alert.alert('Success', `${selectedItems.size} media files imported`);
    } catch (error) {
      console.error('Import failed:', error);
      Alert.alert('Error', 'Failed to import media files');
    }
  };

  const openFilePicker = () => {
    const options = {
      mediaType: 'mixed' as MediaType,
      includeBase64: false,
      maxHeight: 2000,
      maxWidth: 2000,
      quality: 0.8,
    };

    launchImageLibrary(options, (response: ImagePickerResponse) => {
      if (response.didCancel || response.errorMessage) {
        return;
      }

      if (response.assets && response.assets[0]) {
        const asset = response.assets[0];
        handleSelectedAsset(asset);
      }
    });
  };

  const handleSelectedAsset = async (asset: any) => {
    try {
      // ファイルのコピーまたは移動
      const fileName = asset.fileName || `imported_${Date.now()}.${asset.type?.split('/')[1] || 'mp4'}`;
      const destinationPath = `${RNFS.DocumentDirectoryPath}/media/${fileName}`;

      // ディレクトリの作成
      const mediaDir = `${RNFS.DocumentDirectoryPath}/media`;
      const dirExists = await RNFS.exists(mediaDir);
      if (!dirExists) {
        await RNFS.mkdir(mediaDir);
      }

      // ファイルのコピー
      await RNFS.copyFile(asset.uri, destinationPath);

      // メディアアイテムの作成
      const mediaItem: MediaItem = {
        id: `imported_${Date.now()}`,
        name: fileName,
        uri: destinationPath,
        type: asset.type?.startsWith('video/') ? 'video' : 'audio',
        size: asset.fileSize || 0,
      };

      setMediaItems(prev => [mediaItem, ...prev]);
    } catch (error) {
      console.error('Failed to handle selected asset:', error);
      Alert.alert('Error', 'Failed to import selected file');
    }
  };

  const renderMediaItem = ({item}: {item: MediaItem}) => (
    <TouchableOpacity
      style={[
        styles.mediaItem,
        selectedItems.has(item.id) && styles.selectedMediaItem,
      ]}
      onPress={() => selectMediaItem(item.id)}
    >
      <View style={styles.mediaIcon}>
        {item.thumbnail ? (
          <Image source={{uri: item.thumbnail}} style={styles.thumbnail} />
        ) : (
          <Text style={styles.mediaTypeIcon}>
            {item.type === 'video' ? '🎥' : item.type === 'audio' ? '🎵' : '🖼️'}
          </Text>
        )}
      </View>

      <View style={styles.mediaInfo}>
        <Text style={styles.mediaName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.mediaDetails}>
          {item.type} • {(item.size / (1024 * 1024)).toFixed(1)}MB
          {item.duration && ` • ${item.duration.toFixed(1)}s`}
        </Text>
      </View>

      {selectedItems.has(item.id) && (
        <View style={styles.selectionIndicator}>
          <Text style={styles.selectionText}>✓</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.title}>Media Library</Text>

        <View style={styles.headerActions}>
          <TouchableOpacity onPress={openFilePicker} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Add</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={importSelectedMedia}
            style={[
              styles.headerButton,
              selectedItems.size === 0 && styles.disabledButton,
            ]}
            disabled={selectedItems.size === 0}
          >
            <Text style={styles.headerButtonText}>
              Import ({selectedItems.size})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* メディアリスト */}
      <FlatList
        data={mediaItems}
        renderItem={renderMediaItem}
        keyExtractor={(item) => item.id}
        numColumns={2}
        contentContainerStyle={styles.mediaGrid}
        refreshing={isLoading}
        onRefresh={loadMediaLibrary}
      />
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
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#e2e8f0',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
  },
  headerButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#3b82f6',
    borderRadius: 4,
  },
  headerButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  disabledButton: {
    backgroundColor: '#64748b',
  },
  mediaGrid: {
    padding: 8,
  },
  mediaItem: {
    flex: 1,
    margin: 8,
    backgroundColor: '#1e293b',
    borderRadius: 8,
    padding: 12,
    maxWidth: '50%',
  },
  selectedMediaItem: {
    backgroundColor: '#3b82f6',
  },
  mediaIcon: {
    width: '100%',
    height: 120,
    backgroundColor: '#334155',
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  thumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  mediaTypeIcon: {
    fontSize: 48,
  },
  mediaInfo: {
    flex: 1,
  },
  mediaName: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  mediaDetails: {
    color: '#64748b',
    fontSize: 12,
  },
  selectionIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#10b981',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectionText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});
