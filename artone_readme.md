# Artone - Professional Video Editor

🎬 ブラウザで動作するプロフェッショナルビデオエディター

![Artone Logo](https://img.shields.io/badge/Artone-Video%20Editor-blue?style=for-the-badge&logo=video&logoColor=white)

## 🌟 特徴

- **ブラウザベース**: インストール不要で即座に利用開始
- **マルチトラック編集**: ビデオ、オーディオ、テキストトラックをサポート
- **リアルタイムプレビュー**: 編集結果を即座に確認
- **エフェクト機能**: ブラー、不透明度、スケール調整
- **ビデオエクスポート**: WebM形式での高品質出力
- **直感的UI**: ドラッグ&ドロップによる簡単操作

## 🚀 機能

### 基本機能
- ✅ メディアファイルのインポート（動画、音声、画像）
- ✅ マルチトラックタイムライン
- ✅ リアルタイム再生・停止
- ✅ テキスト追加
- ✅ タイムラインズーム
- ✅ クリップのプロパティ編集

### エフェクト
- ✅ 不透明度調整
- ✅ スケール変更
- ✅ ブラーエフェクト
- ✅ 明度・コントラスト・彩度調整（予定）

### エクスポート
- ✅ WebM形式での出力
- ✅ カスタム解像度（1920x1080）
- ✅ プログレス表示

## 📋 必要要件

- モダンなWebブラウザ（Chrome, Firefox, Safari, Edge）
- HTML5 Canvas と MediaRecorder API サポート

## 🛠️ 使用方法

### ローカル実行

1. リポジトリをクローン:
```bash
git clone https://github.com/yourusername/artone-video-editor.git
cd artone-video-editor
```

2. HTMLファイルをブラウザで開く:
```bash
# シンプルなHTTPサーバーを起動（推奨）
python -m http.server 8000
# または
npx serve .
```

3. ブラウザで `http://localhost:8000` を開く

### 使用手順

1. **メディア追加**: 「メディア追加」ボタンをクリックして動画・音声・画像ファイルを選択
2. **編集**: タイムライン上のクリップをクリックして選択し、右パネルでプロパティを調整
3. **テキスト追加**: 「テキスト追加」ボタンでテキストクリップを追加
4. **再生**: 再生ボタンでプレビューを確認
5. **エクスポート**: 「エクスポート」ボタンで動画を出力

## 🎮 操作方法

| 操作 | 説明 |
|------|------|
| メディア追加 | ファイルをインポートしてトラックに自動配置 |
| クリップ選択 | タイムライン上のクリップをクリック |
| 再生/停止 | プレビューの再生制御 |
| ズーム | タイムラインの表示倍率調整 |
| プロパティ編集 | 選択クリップの詳細設定 |

## 🏗️ アーキテクチャ

```
Artone Video Editor
├── Project Management (プロジェクト管理)
├── Media Handler (メディア処理)
├── Timeline Engine (タイムライン)
├── Preview Renderer (プレビュー描画)
├── Effects Engine (エフェクト処理)
└── Video Exporter (動画出力)
```

### 技術スタック
- **Frontend**: React 18, HTML5 Canvas
- **Styling**: Tailwind CSS
- **Build**: Babel Standalone
- **APIs**: MediaRecorder, File API, Canvas API

## 📁 ディレクトリ構造

```
artone-video-editor/
├── index.html          # メインアプリケーションファイル
├── README.md           # プロジェクト説明
├── package.json        # プロジェクト設定
├── LICENSE            # ライセンス
├── .gitignore         # Git無視ファイル
└── docs/              # ドキュメント
    ├── API.md         # API仕様
    └── CONTRIBUTING.md # 貢献ガイド
```

## 🤝 貢献

プロジェクトへの貢献を歓迎します！

1. このリポジトリをフォーク
2. 機能ブランチを作成 (`git checkout -b feature/AmazingFeature`)
3. 変更をコミット (`git commit -m 'Add some AmazingFeature'`)
4. ブランチにプッシュ (`git push origin feature/AmazingFeature`)
5. Pull Requestを作成

## 📝 ライセンス

このプロジェクトはMITライセンスの下で公開されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。

## 🛣️ ロードマップ

### v1.1.0 (予定)
- [ ] 音声波形表示
- [ ] キーフレームアニメーション
- [ ] より多くのエフェクト
- [ ] undo/redo機能

### v1.2.0 (予定)
- [ ] 複数フォーマット対応
- [ ] プロジェクト保存・読み込み
- [ ] カスタムフォント対応
- [ ] 高度なカラーグレーディング

## 🐛 既知の問題

- 大容量ファイルでのメモリ使用量
- Safari でのエクスポート制限
- モバイルデバイスでの操作性

## 📞 サポート

- **Issues**: [GitHub Issues](https://github.com/yourusername/artone-video-editor/issues)
- **Discord**: [コミュニティサーバー](https://discord.gg/artone)
- **Email**: support@artone.example.com

## 🙏 謝辞

- React チーム
- Tailwind CSS チーム
- Web標準の貢献者の皆様

---

**Artone Video Editor** - ブラウザで完結するプロフェッショナルビデオエディター

[![GitHub stars](https://img.shields.io/github/stars/yourusername/artone-video-editor.svg?style=social&label=Star)](https://github.com/yourusername/artone-video-editor)
[![GitHub forks](https://img.shields.io/github/forks/yourusername/artone-video-editor.svg?style=social&label=Fork)](https://github.com/yourusername/artone-video-editor)
