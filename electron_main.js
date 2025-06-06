const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');

// アプリケーションの設定
const isDev = process.env.NODE_ENV === 'development';
const isMac = process.platform === 'darwin';

let mainWindow;

// メニューテンプレート
const menuTemplate = [
  {
    label: 'ファイル',
    submenu: [
      {
        label: '新規プロジェクト',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          mainWindow.webContents.send('menu-new-project');
        }
      },
      {
        label: 'プロジェクトを開く',
        accelerator: 'CmdOrCtrl+O',
        click: async () => {
          const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
              { name: 'Artone Project', extensions: ['artone'] },
              { name: 'All Files', extensions: ['*'] }
            ]
          });
          
          if (!result.canceled) {
            mainWindow.webContents.send('menu-open-project', result.filePaths[0]);
          }
        }
      },
      {
        label: 'プロジェクトを保存',
        accelerator: 'CmdOrCtrl+S',
        click: () => {
          mainWindow.webContents.send('menu-save-project');
        }
      },
      { type: 'separator' },
      {
        label: 'メディアをインポート',
        accelerator: 'CmdOrCtrl+I',
        click: async () => {
          const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections'],
            filters: [
              { name: 'Media Files', extensions: ['mp4', 'avi', 'mov', 'webm', 'mp3', 'wav', 'ogg', 'jpg', 'jpeg', 'png', 'gif'] },
              { name: 'Video Files', extensions: ['mp4', 'avi', 'mov', 'webm'] },
              { name: 'Audio Files', extensions: ['mp3', 'wav', 'ogg'] },
              { name: 'Image Files', extensions: ['jpg', 'jpeg', 'png', 'gif'] },
              { name: 'All Files', extensions: ['*'] }
            ]
          });
          
          if (!result.canceled) {
            mainWindow.webContents.send('menu-import-media', result.filePaths);
          }
        }
      },
      { type: 'separator' },
      {
        label: 'エクスポート',
        accelerator: 'CmdOrCtrl+E',
        click: () => {
          mainWindow.webContents.send('menu-export');
        }
      },
      { type: 'separator' },
      isMac ? { role: 'close' } : { role: 'quit' }
    ]
  },
  {
    label: '編集',
    submenu: [
      {
        label: '元に戻す',
        accelerator: 'CmdOrCtrl+Z',
        click: () => {
          mainWindow.webContents.send('menu-undo');
        }
      },
      {
        label: 'やり直し',
        accelerator: 'CmdOrCtrl+Shift+Z',
        click: () => {
          mainWindow.webContents.send('menu-redo');
        }
      },
      { type: 'separator' },
      {
        label: 'カット',
        accelerator: 'CmdOrCtrl+X',
        click: () => {
          mainWindow.webContents.send('menu-cut');
        }
      },
      {
        label: 'コピー',
        accelerator: 'CmdOrCtrl+C',
        click: () => {
          mainWindow.webContents.send('menu-copy');
        }
      },
      {
        label: 'ペースト',
        accelerator: 'CmdOrCtrl+V',
        click: () => {
          mainWindow.webContents.send('menu-paste');
        }
      },
      { type: 'separator' },
      {
        label: 'テキストを追加',
        accelerator: 'CmdOrCtrl+T',
        click: () => {
          mainWindow.webContents.send('menu-add-text');
        }
      }
    ]
  },
  {
    label: '表示',
    submenu: [
      {
        label: 'タイムラインをズームイン',
        accelerator: 'CmdOrCtrl+Plus',
        click: () => {
          mainWindow.webContents.send('menu-zoom-in');
        }
      },
      {
        label: 'タイムラインをズームアウト',
        accelerator: 'CmdOrCtrl+-',
        click: () => {
          mainWindow.webContents.send('menu-zoom-out');
        }
      },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'forceReload' },
      { role: 'toggleDevTools' },
      { type: 'separator' },
      { role: 'resetZoom' },
      { role: 'zoomIn' },
      { role: 'zoomOut' },
      { type: 'separator' },
      { role: 'togglefullscreen' }
    ]
  },
  {
    label: '再生',
    submenu: [
      {
        label: '再生/停止',
        accelerator: 'Space',
        click: () => {
          mainWindow.webContents.send('menu-play-pause');
        }
      },
      {
        label: '先頭に移動',
        accelerator: 'Home',
        click: () => {
          mainWindow.webContents.send('menu-go-to-start');
        }
      },
      {
        label: '末尾に移動',
        accelerator: 'End',
        click: () => {
          mainWindow.webContents.send('menu-go-to-end');
        }
      }
    ]
  },
  {
    label: 'ヘルプ',
    submenu: [
      {
        label: 'Artone について',
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'Artone Video Editor について',
            message: 'Artone Video Editor v1.0.0',
            detail: 'プロフェッショナルビデオエディター\n\n© 2025 Artone Team\nMIT License'
          });
        }
      },
      {
        label: 'GitHub で開く',
        click: () => {
          shell.openExternal('https://github.com/yourusername/artone-video-editor');
        }
      },
      {
        label: 'キーボードショートカット',
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'キーボードショートカット',
            message: 'Artone Video Editor ショートカット',
            detail: `
ファイル操作:
• Ctrl+N: 新規プロジェクト
• Ctrl+O: プロジェクトを開く
• Ctrl+S: プロジェクトを保存
• Ctrl+I: メディアをインポート
• Ctrl+E: エクスポート

編集操作:
• Ctrl+Z: 元に戻す
• Ctrl+Shift+Z: やり直し
• Ctrl+X: カット
• Ctrl+C: コピー
• Ctrl+V: ペースト
• Ctrl+T: テキストを追加

表示操作:
• Ctrl++: ズームイン
• Ctrl+-: ズームアウト

再生操作:
• Space: 再生/停止
• Home: 先頭に移動
• End: 末尾に移動
            `.trim()
          });
        }
      }
    ]
  }
];

// メインウィンドウを作成
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 700,
    icon: path.join(__dirname, 'assets', 'icon.png'), // アイコンファイル（オプション）
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: !isDev
    },
    titleBarStyle: 'default',
    show: false
  });

  // HTMLファイルを読み込み
  mainWindow.loadFile('renderer/index.html');

  // ウィンドウの準備ができたら表示
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // ウィンドウが閉じられたときの処理
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // 外部リンクをデフォルトブラウザで開く
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // メニューを設定
  const menu = Menu.buildFromTemplate(menuTemplate);
  Menu.setApplicationMenu(menu);
}

// アプリケーションの準備ができたらウィンドウを作成
app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

// すべてのウィンドウが閉じられたときの処理
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// セキュリティ: 新しいウィンドウの作成を制限
app.on('web-contents-created', (event, contents) => {
  contents.on('new-window', (event, navigationUrl) => {
    event.preventDefault();
    shell.openExternal(navigationUrl);
  });
});

// ファイル保存ダイアログ
async function showSaveDialog(filters) {
  const result = await dialog.showSaveDialog(mainWindow, {
    filters: filters || [
      { name: 'Video Files', extensions: ['webm', 'mp4'] },
      { name: 'All Files', extensions: ['*'] }
    ]
  });
  
  return result;
}

// IPCハンドラ（レンダラープロセスとの通信）
const { ipcMain } = require('electron');

ipcMain.handle('show-save-dialog', async (event, filters) => {
  return await showSaveDialog(filters);
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, options);
  return result;
});

ipcMain.handle('show-message-box', async (event, options) => {
  const result = await dialog.showMessageBox(mainWindow, options);
  return result;
});

ipcMain.handle('write-file', async (event, filePath, data) => {
  try {
    fs.writeFileSync(filePath, data);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('read-file', async (event, filePath) => {
  try {
    const data = fs.readFileSync(filePath);
    return { success: true, data };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// アプリケーション情報
ipcMain.handle('get-app-version', () => {
  return app.getVersion();
});

ipcMain.handle('get-app-path', () => {
  return app.getAppPath();
});
