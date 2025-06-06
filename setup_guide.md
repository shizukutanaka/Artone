# Artone Video Editor - セットアップガイド

Windows実行ファイル(.exe)を作成するための完全なセットアップガイドです。

## 📁 プロジェクト構造

以下のファイル構造を作成してください：

```
artone-video-editor/
├── main.js                 # Electronメインプロセス
├── preload.js             # プリロードスクリプト
├── package.json           # プロジェクト設定
├── build.bat              # Windowsビルドスクリプト
├── README.md              # ドキュメント
├── LICENSE                # ライセンス
├── .gitignore            # Git除外設定
├── CONTRIBUTING.md        # 貢献ガイド
├── renderer/              # レンダラープロセス
│   └── index.html         # メインUIアプリケーション
└── assets/                # アプリケーションリソース
    ├── icon.ico           # Windows用アイコン（256x256）
    ├── icon.icns          # macOS用アイコン
    └── icon.png           # Linux/汎用アイコン（512x512）
```

## 🚀 クイックスタート

### 1. 前提条件のインストール

**Node.js をインストール**:
1. [Node.js公式サイト](https://nodejs.org/)にアクセス
2. LTS版（推奨版）をダウンロード
3. インストーラーを実行してセットアップ

**インストール確認**:
```bash
node --version
npm --version
```

### 2. プロジェクトのセットアップ

**ディレクトリ作成**:
```bash
mkdir artone-video-editor
cd artone-video-editor
```

**必要なディレクトリを作成**:
```bash
mkdir renderer
mkdir assets
```

**ファイルをコピー**:
- 提供されたすべてのファイルを対応するディレクトリに配置
- `renderer/index.html` にHTMLファイルを配置
- アイコンファイルを `assets/` に配置

### 3. 依存関係のインストール

```bash
npm install
```

### 4. 開発モードでテスト

```bash
npm run dev
```

アプリケーションが正常に起動することを確認してください。

### 5. 実行ファイルのビルド

**Windowsの場合**:
```bash
# バッチファイルを使用（推奨）
build.bat

# または直接コマンド
npm run build:win
```

**他のプラットフォーム**:
```bash
npm run build:mac    # macOS
npm run build:linux  # Linux
npm run build        # 全プラットフォーム
```

## 📋 詳細セットアップ手順

### アイコンファイルの準備

**Windows用アイコン (icon.ico)**:
- サイズ: 256x256ピクセル推奨
- フォーマット: ICO形式
- オンラインツール: [icoconvert.com](https://icoconvert.com/)

**macOS用アイコン (icon.icns)**:
- サイズ: 512x512ピクセル推奨
- フォーマット: ICNS形式
- ツール: [cloudconvert.com](https://cloudconvert.com/png-to-icns)

**PNG アイコン (icon.png)**:
- サイズ: 512x512ピクセル
- フォーマット: PNG形式（透明背景推奨）

### package.json の設定

主要な設定項目：

```json
{
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "build:win": "electron-builder --win"
  },
  "build": {
    "appId": "com.artone.video-editor",
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico"
    }
  }
}
```

### ビルド設定のカスタマイズ

**インストーラーなしの実行ファイルのみ**:
```json
{
  "build": {
    "win": {
      "target": "portable"
    }
  }
}
```

**複数のターゲット**:
```json
{
  "build": {
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64"] },
        { "target": "portable", "arch": ["x64"] }
      ]
    }
  }
}
```

## 🔧 トラブルシューティング

### よくある問題と解決法

**1. Node.js/npm が認識されない**
```bash
# パスの確認
echo %PATH%

# Node.jsの再インストール
# https://nodejs.org/ から最新版をダウンロード
```

**2. electron-builderのインストールエラー**
```bash
# キャッシュのクリア
npm cache clean --force

# 再インストール
rm -rf node_modules
npm install
```

**3. ビルドエラー "cannot resolve dependency"**
```bash
# 開発依存関係として明示的にインストール
npm install --save-dev electron electron-builder
```

**4. アイコンが表示されない**
- アイコンファイルのパスが正しいか確認
- ファイル形式が正しいか確認（Windows: .ico）
- ファイルサイズが適切か確認（推奨: 256x256）

**5. ウイルス対策ソフトの警告**
- 初回ビルド時は正常な動作
- 必要に応じて例外設定に追加
- コードサイニング証明書の使用を検討

### ビルド最適化

**ファイルサイズを小さくする**:
```json
{
  "build": {
    "compression": "maximum",
    "files": [
      "main.js",
      "preload.js", 
      "renderer/**/*",
      "node_modules/**/*"
    ]
  }
}
```

**特定のファイルを除外**:
```json
{
  "build": {
    "files": [
      "!**/*.md",
      "!**/*.map",
      "!**/.*"
    ]
  }
}
```

## 📦 配布について

### 作成されるファイル

**NSISインストーラー**:
- `Artone-Video-Editor-1.0.0-x64.exe` (インストーラー)
- ユーザーはインストールが必要

**ポータブル版**:
- `Artone-Video-Editor-1.0.0-Portable.exe` (単体実行ファイル)
- インストール不要、どこでも実行可能

### 配布時の注意点

1. **システム要件の明記**: Windows 10以降
2. **ファイルサイズ**: 約100-200MB
3. **初回起動**: ウイルススキャンで時間がかかる場合あり
4. **署名なし警告**: 初回実行時にWindows Defenderの警告が表示される可能性

### デジタル署名（推奨）

商用配布の場合は、コードサイニング証明書の使用を推奨：

```json
{
  "build": {
    "win": {
      "certificateFile": "path/to/certificate.p12",
      "certificatePassword": "password"
    }
  }
}
```

## 🚀 次のステップ

1. **テスト**: 複数のWindows環境でテスト
2. **最適化**: パフォーマンスとファイルサイズの最適化
3. **自動更新**: electron-updaterの実装
4. **CI/CD**: GitHub Actionsでの自動ビルド設定

## 📞 サポート

問題が発生した場合：

1. [GitHub Issues](https://github.com/yourusername/artone-video-editor/issues)で報告
2. ログファイルを確認（`%APPDATA%/artone-video-editor/logs/`）
3. システム情報を提供（OS、Node.jsバージョンなど）

---

このガイドに従って、Artone Video Editorの完全なWindows実行ファイルを作成できます！