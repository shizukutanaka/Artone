# Artone Video Editor - Desktop Edition

🎬 プロフェッショナルデスクトップビデオエディター（Windows .exe実行ファイル）

![Artone Logo](https://img.shields.io/badge/Artone-Desktop%20Video%20Editor-blue?style=for-the-badge&logo=video&logoColor=white)
![Electron](https://img.shields.io/badge/Electron-28.0.0-47848F?style=for-the-badge&logo=electron&logoColor=white)
![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Mac%20%7C%20Linux-lightgrey?style=for-the-badge)

## 🌟 特徴

- **デスクトップアプリケーション**: Windows実行ファイル(.exe)として動作
- **マルチトラック編集**: ビデオ、オーディオ、テキストトラックをサポート
- **リアルタイムプレビュー**: 編集結果を即座に確認
- **プロジェクト保存**: .artone形式でプロジェクトを保存・読み込み
- **ネイティブメニュー**: Windows標準のメニューバーとキーボードショートカット
- **ファイルシステム統合**: ローカルファイルの直接アクセス
- **エフェクト機能**: ブラー、不透明度、スケール調整
- **高品質エクスポート**: WebM形式での出力

## 🚀 インストール・実行方法

### 💿 バイナリ実行（推奨）

1. **Releases**からWindows用実行ファイルをダウンロード:
   - `Artone-Video-Editor-1.0.0-x64.exe` (インストーラー版)
   - `Artone-Video-Editor-1.0.0-Portable.exe` (ポータブル版)

2. **実行**:
   - インストーラー版: ダウンロード後、実行してインストール
   - ポータブル版: ダウンロード後、直接実行（インストール不要）

### 🛠️ ソースからビルド

#### 前提条件
- Node.js 16.0.0以上
- npm または yarn
- Git

#### セットアップ手順

1. **リポジトリをクローン**:
```bash
git clone https://github.com/yourusername/artone-video-editor.git
cd artone-video-editor
```

2. **依存関係をインストール**:
```bash
npm install
```

3. **開発モードで実行**:
```bash
npm run dev
```

4. **実行ファイルをビルド**:
```bash
# Windows用EXEファイルを作成
npm run build:win

# 他のプラットフォーム
npm run build:mac    # macOS用
npm run build:linux  # Linux用
npm run build        # 全プラットフォーム
```

ビルドが完了すると、`dist/`フォルダに実行ファイルが生成されます:
- Windows: `Artone-Video-Editor-1.0.0-x64.exe`
- macOS: `Artone-Video-Editor-1.0.0-x64.dmg`
- Linux: `Artone-Video-Editor-1.0.0-x64.AppImage`

## 📁 プロジェクト構造

```
artone-video-editor/
├── main.js              # Electronメインプロセス
├── preload.js           # セキュリティ用プリロードスクリプト
├── renderer/
│   └── index.html       # レンダラープロセス（UIアプリケーション）
├── assets/              # アプリケーションアイコンとリソース
│   ├── icon.ico         # Windows用アイコン
│   ├── icon.icns        # macOS用アイコン
│   └── icon.png         # Linux用アイコン
├── package.json         # プロジェクト設定
├── README.md           # このファイル
└── dist/               # ビルド出力（生成される）
```

## 🎮 使用方法

### 基本操作

1. **プロジェクト管理**:
   - `Ctrl+N`: 新規プロジェクト
   - `Ctrl+O`: プロジェクトを開く
   - `Ctrl+S`: プロジェクトを保存

2. **メディア操作**:
   - `Ctrl+I`: メディアファイルをインポート
   - ドラッグ&ドロップ: ファイルをタイムラインに直接追加

3. **編集操作**:
   - `Ctrl+T`: テキストを追加
   - クリップ選択: タイムライン上のクリップをクリック
   - プロパティ編集: 右パネルで詳細設定

4. **再生制御**:
   - `Space`: 再生/停止
   - `Home`: 先頭に移動
   - `End`: 末尾に移動

5. **タイムライン操作**:
   - `Ctrl+Plus`: ズームイン
   - `Ctrl+Minus`: ズームアウト

### プロジェクト保存

- ファイル形式: `.artone`（JSON形式）
- 保存内容: プロジェクト設定、メディア参照、タイムライン構成
- 自動保存: 実装予定

### エクスポート

1. メニューから `ファイル > エクスポート` または `Ctrl+E`
2. 保存場所とファイル名を指定
3. WebM形式で高品質動画を出力

## 🔧 開発者向け情報

### アーキテクチャ

```
┌─────────────────┐    ┌─────────────────┐
│ Main Process    │    │ Renderer Process│
│ (Node.js)       │◄──►│ (Chromium)      │
│                 │    │                 │
│ - ファイル管理   │    │ - UI描画        │
│ - メニュー処理   │    │ - ビデオ処理    │
│ - IPC通信       │    │ - Canvas操作    │
└─────────────────┘    └─────────────────┘
```

### 技術スタック

- **Electron 28.0.0**: デスクトップアプリケーションフレームワーク
- **React 18**: UIライブラリ
- **HTML5 Canvas**: ビデオレンダリング
- **MediaRecorder API**: ビデオエクスポート
- **Tailwind CSS**: スタイリング

### カスタムビルド設定

`package.json`の`build`セクションでビルド設定をカスタマイズ可能:

```json
{
  "build": {
    "appId": "com.artone.video-editor",
    "win": {
      "target": "nsis",
      "icon": "assets/icon.ico"
    }
  }
}
```

## 📋 システム要件

### 最小要件
- **OS**: Windows 10 (64-bit) / macOS 10.14 / Ubuntu 18.04
- **RAM**: 4GB
- **ストレージ**: 500MB空き容量
- **GPU**: DirectX 11対応 / OpenGL 3.3対応

### 推奨要件
- **OS**: Windows 11 (64-bit) / macOS 12+ / Ubuntu 20.04+
- **RAM**: 8GB以上
- **ストレージ**: 2GB空き容量（プロジェクトファイル用）
- **GPU**: 専用グラフィックカード

## 🚀 機能一覧

### 現在の機能
- ✅ マルチトラックタイムライン
- ✅ ビデオ・オーディオ・画像・テキスト対応
- ✅ リアルタイムプレビュー
- ✅ 基本エフェクト（ブラー、不透明度、スケール）
- ✅ プロジェクト保存・読み込み
- ✅ WebMエクスポート
- ✅ キーボードショートカット
- ✅ ドラッグ&ドロップ対応

### 開発予定機能
- 🔄 音声波形表示
- 🔄 キーフレームアニメーション
- 🔄 自動保存機能
- 🔄 プラグインシステム
- 🔄 MP4エクスポート
- 🔄 undo/redo機能

## 🤝 貢献方法

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Requestを作成

詳細は [CONTRIBUTING.md](CONTRIBUTING.md) を参照してください。

## 📄 ライセンス

このプロジェクトは [MIT License](LICENSE) の下で公開されています。

## 🆘 サポート・トラブルシューティング

### よくある問題

**Q: アプリが起動しない**
A: Windows Defenderなどのセキュリティソフトが実行をブロックしている可能性があります。「詳細」→「実行」を選択してください。

**Q: 大きなビデオファイルで動作が重い**
A: メモリ不足の可能性があります。不要なアプリケーションを終了してから再試行してください。

**Q: エクスポートが失敗する**
A: 出力先フォルダに書き込み権限があることを確認してください。

### サポートチャンネル

- **GitHub Issues**: バグレポート・機能リクエスト
- **GitHub Discussions**: 質問・議論
- **Email**: support@artone.example.com

## 🙏 謝辞

- Electron開発チーム
- React開発チーム  
- Web標準コミュニティ
- オープンソースコントリビューターの皆様

---

**Artone Video Editor** - プロフェッショナルデスクトップビデオエディター

[![Download](https://img.shields.io/badge/Download-Latest%20Release-brightgreen?style=for-the-badge)](https://github.com/yourusername/artone-video-editor/releases)
[![GitHub stars](https://img.shields.io/github/stars/yourusername/artone-video-editor.svg?style=social&label=Star)](https://github.com/yourusername/artone-video-editor)
