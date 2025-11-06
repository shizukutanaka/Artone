/**
 * React Native 版 Electron API Hook
 * React NativeでもElectronネイティブ機能を使用するための統合
 */

import {useEffect, useCallback} from 'react';
import {Alert, Linking} from 'react-native';

// Web版のElectron APIとの互換性を保つための型定義
declare global {
  interface Window {
    electronAPI: {
      platform: string;
      isMac: boolean;
      isWindows: boolean;
      isLinux: boolean;
    };
    fileSystemAPI: {
      showOpenDialog: (options: any) => Promise<any>;
      showSaveDialog: (options: any) => Promise<any>;
      readFile: (filePath: string) => Promise<string>;
      writeFile: (filePath: string, content: string) => Promise<boolean>;
      showNotification: (options: any) => Promise<boolean>;
      minimizeWindow: () => Promise<void>;
      maximizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      openExternal: (url: string) => Promise<boolean>;
      getSystemInfo: () => Promise<any>;
    };
    menuAPI: {
      onNewProject: (callback: () => void) => void;
      onOpenProject: (callback: () => void) => void;
      onSaveProject: (callback: () => void) => void;
      onExportVideo: (callback: () => void) => void;
      onUndo: (callback: () => void) => void;
      onRedo: (callback: () => void) => void;
      onPlayPause: (callback: () => void) => void;
      onNotificationClick: (callback: (action: string) => void) => void;
    };
  }
}

export const useElectronAPI = () => {
  // React NativeではWebView経由でElectron APIにアクセスするか、またはネイティブモジュールを使用
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  const showOpenDialog = useCallback(async (options: any) => {
    if (isElectron) {
      try {
        return await window.fileSystemAPI.showOpenDialog(options);
      } catch (error) {
        console.error('Failed to show open dialog:', error);
        return null;
      }
    } else {
      // React Native ではDocumentPickerやImagePickerを使用
      Alert.alert('Feature', 'File picker will use React Native DocumentPicker');
      return null;
    }
  }, [isElectron]);

  const showSaveDialog = useCallback(async (options: any) => {
    if (isElectron) {
      try {
        return await window.fileSystemAPI.showSaveDialog(options);
      } catch (error) {
        console.error('Failed to show save dialog:', error);
        return null;
      }
    } else {
      // React Native ではShareやファイル書き込みAPIを使用
      Alert.alert('Feature', 'File save will use React Native file system APIs');
      return null;
    }
  }, [isElectron]);

  const readFile = useCallback(async (filePath: string) => {
    if (isElectron) {
      try {
        return await window.fileSystemAPI.readFile(filePath);
      } catch (error) {
        console.error('Failed to read file:', error);
        return null;
      }
    } else {
      // React Native ではreact-native-fsを使用
      Alert.alert('Feature', 'File read will use react-native-fs');
      return null;
    }
  }, [isElectron]);

  const writeFile = useCallback(async (filePath: string, content: string) => {
    if (isElectron) {
      try {
        return await window.fileSystemAPI.writeFile(filePath, content);
      } catch (error) {
        console.error('Failed to write file:', error);
        return false;
      }
    } else {
      // React Native ではreact-native-fsを使用
      Alert.alert('Feature', 'File write will use react-native-fs');
      return false;
    }
  }, [isElectron]);

  const showNotification = useCallback(async (options: any) => {
    if (isElectron) {
      try {
        return await window.fileSystemAPI.showNotification(options);
      } catch (error) {
        console.error('Failed to show notification:', error);
        return false;
      }
    } else {
      // React Native ではPushNotificationやAlertを使用
      Alert.alert(options.title || 'Notification', options.body || '');
      return true;
    }
  }, [isElectron]);

  const minimizeWindow = useCallback(async () => {
    if (isElectron) {
      try {
        await window.fileSystemAPI.minimizeWindow();
      } catch (error) {
        console.error('Failed to minimize window:', error);
      }
    } else {
      // React Native ではアプリの最小化はOS依存
      Alert.alert('Feature', 'Window minimize not available in mobile');
    }
  }, [isElectron]);

  const maximizeWindow = useCallback(async () => {
    if (isElectron) {
      try {
        await window.fileSystemAPI.maximizeWindow();
      } catch (error) {
        console.error('Failed to maximize window:', error);
      }
    } else {
      // React Native ではフルスクリーンに相当
      Alert.alert('Feature', 'Window maximize not available in mobile');
    }
  }, [isElectron]);

  const closeWindow = useCallback(async () => {
    if (isElectron) {
      try {
        await window.fileSystemAPI.closeWindow();
      } catch (error) {
        console.error('Failed to close window:', error);
      }
    } else {
      // React Native ではアプリ終了
      Alert.alert('Close App', 'This will close the application', [
        {text: 'Cancel', style: 'cancel'},
        {text: 'OK', onPress: () => {
          // React Native ではBackHandler.exitApp()を使用
        }},
      ]);
    }
  }, [isElectron]);

  const openExternal = useCallback(async (url: string) => {
    if (isElectron) {
      try {
        return await window.fileSystemAPI.openExternal(url);
      } catch (error) {
        console.error('Failed to open external link:', error);
        return false;
      }
    } else {
      // React Native ではLinking.openURLを使用
      try {
        await Linking.openURL(url);
        return true;
      } catch (error) {
        console.error('Failed to open URL:', error);
        return false;
      }
    }
  }, [isElectron]);

  const getSystemInfo = useCallback(async () => {
    if (isElectron) {
      try {
        return await window.fileSystemAPI.getSystemInfo();
      } catch (error) {
        console.error('Failed to get system info:', error);
        return null;
      }
    } else {
      // React Native ではPlatformとDimensionsを使用
      return {
        platform: Platform.OS,
        version: Platform.Version,
        isTablet: Platform.isPad || false,
      };
    }
  }, [isElectron]);

  return {
    isElectron,
    platform: isElectron ? window.electronAPI.platform : Platform.OS,
    isMac: isElectron ? window.electronAPI.isMac : Platform.OS === 'ios',
    isWindows: isElectron ? window.electronAPI.isWindows : Platform.OS === 'android',
    isLinux: isElectron ? window.electronAPI.isLinux : false,
    showOpenDialog,
    showSaveDialog,
    readFile,
    writeFile,
    showNotification,
    minimizeWindow,
    maximizeWindow,
    closeWindow,
    openExternal,
    getSystemInfo
  };
};

export const useMenuAPI = (callbacks: {
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onSaveProject?: () => void;
  onExportVideo?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onPlayPause?: () => void;
  onNotificationClick?: (action: string) => void;
}) => {
  const isElectron = typeof window !== 'undefined' && !!window.menuAPI;

  useEffect(() => {
    if (isElectron) {
      const { menuAPI } = window;

      if (callbacks.onNewProject) {
        menuAPI.onNewProject(callbacks.onNewProject);
      }

      if (callbacks.onOpenProject) {
        menuAPI.onOpenProject(callbacks.onOpenProject);
      }

      if (callbacks.onSaveProject) {
        menuAPI.onSaveProject(callbacks.onSaveProject);
      }

      if (callbacks.onExportVideo) {
        menuAPI.onExportVideo(callbacks.onExportVideo);
      }

      if (callbacks.onUndo) {
        menuAPI.onUndo(callbacks.onUndo);
      }

      if (callbacks.onRedo) {
        menuAPI.onRedo(callbacks.onRedo);
      }

      if (callbacks.onPlayPause) {
        menuAPI.onPlayPause(callbacks.onPlayPause);
      }

      if (callbacks.onNotificationClick) {
        menuAPI.onNotificationClick(callbacks.onNotificationClick);
      }
    } else {
      // React Native ではハードウェアボタンやジェスチャーを使用
      console.log('Menu API not available in React Native - using native gestures');
    }

    return () => {
      // Cleanup
    };
  }, [isElectron, callbacks]);

  return { isElectron };
};
