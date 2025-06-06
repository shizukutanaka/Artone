const { contextBridge, ipcRenderer } = require('electron');

// セキュアなAPIをレンダラープロセスに公開
contextBridge.exposeInMainWorld('electronAPI', {
  // ファイル操作
  showSaveDialog: (filters) => ipcRenderer.invoke('show-save-dialog', filters),
  showOpenDialog: (options) => ipcRenderer.invoke('show-open-dialog', options),
  showMessageBox: (options) => ipcRenderer.invoke('show-message-box', options),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  
  // アプリケーション情報
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  
  // メニューイベントのリスナー
  onMenuAction: (callback) => {
    // メニューからのアクション
    ipcRenderer.on('menu-new-project', callback);
    ipcRenderer.on('menu-open-project', callback);
    ipcRenderer.on('menu-save-project', callback);
    ipcRenderer.on('menu-import-media', callback);
    ipcRenderer.on('menu-export', callback);
    
    // 編集メニュー
    ipcRenderer.on('menu-undo', callback);
    ipcRenderer.on('menu-redo', callback);
    ipcRenderer.on('menu-cut', callback);
    ipcRenderer.on('menu-copy', callback);
    ipcRenderer.on('menu-paste', callback);
    ipcRenderer.on('menu-add-text', callback);
    
    // 表示メニュー
    ipcRenderer.on('menu-zoom-in', callback);
    ipcRenderer.on('menu-zoom-out', callback);
    
    // 再生メニュー
    ipcRenderer.on('menu-play-pause', callback);
    ipcRenderer.on('menu-go-to-start', callback);
    ipcRenderer.on('menu-go-to-end', callback);
  },
  
  // メニューイベントのリスナー削除
  removeMenuListeners: () => {
    ipcRenderer.removeAllListeners('menu-new-project');
    ipcRenderer.removeAllListeners('menu-open-project');
    ipcRenderer.removeAllListeners('menu-save-project');
    ipcRenderer.removeAllListeners('menu-import-media');
    ipcRenderer.removeAllListeners('menu-export');
    ipcRenderer.removeAllListeners('menu-undo');
    ipcRenderer.removeAllListeners('menu-redo');
    ipcRenderer.removeAllListeners('menu-cut');
    ipcRenderer.removeAllListeners('menu-copy');
    ipcRenderer.removeAllListeners('menu-paste');
    ipcRenderer.removeAllListeners('menu-add-text');
    ipcRenderer.removeAllListeners('menu-zoom-in');
    ipcRenderer.removeAllListeners('menu-zoom-out');
    ipcRenderer.removeAllListeners('menu-play-pause');
    ipcRenderer.removeAllListeners('menu-go-to-start');
    ipcRenderer.removeAllListeners('menu-go-to-end');
  }
});

// プラットフォーム情報を公開
contextBridge.exposeInMainWorld('platform', {
  isMac: process.platform === 'darwin',
  isWindows: process.platform === 'win32',
  isLinux: process.platform === 'linux',
  platform: process.platform
});

// Node.js APIの一部を安全に公開
contextBridge.exposeInMainWorld('nodeAPI', {
  // パス操作
  path: {
    join: (...args) => require('path').join(...args),
    dirname: (path) => require('path').dirname(path),
    basename: (path) => require('path').basename(path),
    extname: (path) => require('path').extname(path)
  },
  
  // URL操作（ファイルパス用）
  pathToFileURL: (path) => {
    const { pathToFileURL } = require('url');
    return pathToFileURL(path).href;
  }
});
