/**
 * Electron Native API Hook
 * ReactフックでElectronネイティブ機能を使用するための統合
 */

import { useEffect, useCallback } from 'react';

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
  const isElectron = typeof window !== 'undefined' && !!window.electronAPI;

  const showOpenDialog = useCallback(async (options: any) => {
    if (!isElectron) return null;
    try {
      return await window.fileSystemAPI.showOpenDialog(options);
    } catch (error) {
      console.error('Failed to show open dialog:', error);
      return null;
    }
  }, [isElectron]);

  const showSaveDialog = useCallback(async (options: any) => {
    if (!isElectron) return null;
    try {
      return await window.fileSystemAPI.showSaveDialog(options);
    } catch (error) {
      console.error('Failed to show save dialog:', error);
      return null;
    }
  }, [isElectron]);

  const readFile = useCallback(async (filePath: string) => {
    if (!isElectron) return null;
    try {
      return await window.fileSystemAPI.readFile(filePath);
    } catch (error) {
      console.error('Failed to read file:', error);
      return null;
    }
  }, [isElectron]);

  const writeFile = useCallback(async (filePath: string, content: string) => {
    if (!isElectron) return false;
    try {
      return await window.fileSystemAPI.writeFile(filePath, content);
    } catch (error) {
      console.error('Failed to write file:', error);
      return false;
    }
  }, [isElectron]);

  const showNotification = useCallback(async (options: any) => {
    if (!isElectron) return false;
    try {
      return await window.fileSystemAPI.showNotification(options);
    } catch (error) {
      console.error('Failed to show notification:', error);
      return false;
    }
  }, [isElectron]);

  const minimizeWindow = useCallback(async () => {
    if (!isElectron) return;
    try {
      await window.fileSystemAPI.minimizeWindow();
    } catch (error) {
      console.error('Failed to minimize window:', error);
    }
  }, [isElectron]);

  const maximizeWindow = useCallback(async () => {
    if (!isElectron) return;
    try {
      await window.fileSystemAPI.maximizeWindow();
    } catch (error) {
      console.error('Failed to maximize window:', error);
    }
  }, [isElectron]);

  const closeWindow = useCallback(async () => {
    if (!isElectron) return;
    try {
      await window.fileSystemAPI.closeWindow();
    } catch (error) {
      console.error('Failed to close window:', error);
    }
  }, [isElectron]);

  const openExternal = useCallback(async (url: string) => {
    if (!isElectron) {
      window.open(url, '_blank');
      return true;
    }
    try {
      return await window.fileSystemAPI.openExternal(url);
    } catch (error) {
      console.error('Failed to open external link:', error);
      return false;
    }
  }, [isElectron]);

  const getSystemInfo = useCallback(async () => {
    if (!isElectron) return null;
    try {
      return await window.fileSystemAPI.getSystemInfo();
    } catch (error) {
      console.error('Failed to get system info:', error);
      return null;
    }
  }, [isElectron]);

  return {
    isElectron,
    platform: isElectron ? window.electronAPI.platform : 'web',
    isMac: isElectron ? window.electronAPI.isMac : false,
    isWindows: isElectron ? window.electronAPI.isWindows : false,
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
    if (!isElectron) return;

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

    // Cleanup function
    return () => {
      // Note: In a real implementation, you might want to remove these listeners
      // ipcRenderer.removeAllListeners('menu:new-project');
      // etc.
    };
  }, [isElectron, callbacks]);

  return { isElectron };
};
